import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  checkIpRateLimit,
  clearAllRateLimiters,
  createIpRateLimiter,
  getClientIp,
  getRateLimitHeaders,
  IP_RATE_LIMIT_CONFIGS,
} from '@/lib/api/ip-rate-limit';
import { RateLimitError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';

function createMockRequest(headers: Record<string, string> = {}): Request {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  } as unknown as Request;
}

describe('IP Rate Limiting', () => {
  beforeEach(() => {
    clearAllRateLimiters();
  });

  afterEach(() => {
    clearAllRateLimiters();
  });

  describe('getClientIp', () => {
    it('extracts IP from X-Forwarded-For header (single IP)', () => {
      const request = createMockRequest({
        'x-forwarded-for': '192.168.1.1',
      });
      expect(getClientIp(request)).toBe('192.168.1.1');
    });

    it('extracts first IP from X-Forwarded-For with multiple IPs', () => {
      const request = createMockRequest({
        'x-forwarded-for': '203.0.113.50, 70.41.3.18, 150.172.238.178',
      });
      expect(getClientIp(request)).toBe('203.0.113.50');
    });

    it('supports rightmost-untrusted trust mode', () => {
      const request = createMockRequest({
        'x-forwarded-for': '203.0.113.50, 70.41.3.18, 150.172.238.178',
      });
      expect(
        getClientIp(request, {
          ipTrustMode: 'rightmost-untrusted',
          trustedProxyList: ['150.172.238.178', '70.41.3.18'],
        })
      ).toBe('203.0.113.50');
    });

    it('supports trusted-proxies trust mode', () => {
      const request = createMockRequest({
        'x-forwarded-for': '198.51.100.4, 192.0.2.10, 150.172.238.178',
      });
      expect(
        getClientIp(request, {
          ipTrustMode: 'trusted-proxies',
          trustedProxyList: ['192.0.2.10', '150.172.238.178'],
        })
      ).toBe('198.51.100.4');
    });

    it('falls back to unknown when rightmost-untrusted has only trusted IPs', () => {
      const request = createMockRequest({
        'x-forwarded-for': '70.41.3.18, 150.172.238.178',
      });
      expect(
        getClientIp(request, {
          ipTrustMode: 'rightmost-untrusted',
          trustedProxyList: ['70.41.3.18', '150.172.238.178'],
        })
      ).toBe('unknown');
    });

    it('falls back to unknown when trusted-proxies has only trusted IPs', () => {
      const request = createMockRequest({
        'x-forwarded-for': '70.41.3.18, 150.172.238.178',
      });
      expect(
        getClientIp(request, {
          ipTrustMode: 'trusted-proxies',
          trustedProxyList: ['70.41.3.18', '150.172.238.178'],
        })
      ).toBe('unknown');
    });

    it('extracts IP from X-Real-IP header when X-Forwarded-For is absent', () => {
      const request = createMockRequest({
        'x-real-ip': '10.0.0.1',
      });
      expect(getClientIp(request)).toBe('10.0.0.1');
    });

    it('extracts IP from CF-Connecting-IP header (Cloudflare)', () => {
      const request = createMockRequest({
        'cf-connecting-ip': '172.16.0.1',
      });
      expect(getClientIp(request)).toBe('172.16.0.1');
    });

    it('prefers X-Forwarded-For over X-Real-IP', () => {
      const request = createMockRequest({
        'x-forwarded-for': '1.2.3.4',
        'x-real-ip': '5.6.7.8',
      });
      expect(getClientIp(request)).toBe('1.2.3.4');
    });

    it('prefers X-Real-IP over CF-Connecting-IP', () => {
      const request = createMockRequest({
        'x-real-ip': '1.2.3.4',
        'cf-connecting-ip': '5.6.7.8',
      });
      expect(getClientIp(request)).toBe('1.2.3.4');
    });

    it('returns unknown when no IP headers present', () => {
      const request = createMockRequest({});
      expect(getClientIp(request)).toBe('unknown');
    });

    it('logs unknown-IP warning once per interval', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2100-01-01T00:00:00.000Z'));

      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
      const request = createMockRequest({});

      expect(getClientIp(request)).toBe('unknown');
      expect(getClientIp(request)).toBe('unknown');
      expect(warnSpy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(60_001);
      expect(getClientIp(request)).toBe('unknown');
      expect(warnSpy).toHaveBeenCalledTimes(2);

      warnSpy.mockRestore();
      vi.useRealTimers();
    });

    it('returns unknown for invalid IP in X-Forwarded-For', () => {
      const request = createMockRequest({
        'x-forwarded-for': 'not-an-ip',
      });
      expect(getClientIp(request)).toBe('unknown');
    });

    it('falls back to next header when X-Forwarded-For has invalid IP', () => {
      const request = createMockRequest({
        'x-forwarded-for': 'invalid',
        'x-real-ip': '192.168.1.1',
      });
      expect(getClientIp(request)).toBe('192.168.1.1');
    });

    it('handles IPv6 addresses', () => {
      const request = createMockRequest({
        'x-forwarded-for': '2001:db8::1',
      });
      expect(getClientIp(request)).toBe('2001:db8::1');
    });

    it('handles IPv6-mapped IPv4 addresses', () => {
      const request = createMockRequest({
        'x-forwarded-for': '::ffff:192.168.1.1',
      });
      expect(getClientIp(request)).toBe('::ffff:192.168.1.1');
    });

    it('trims whitespace from IP addresses', () => {
      const request = createMockRequest({
        'x-forwarded-for': '  192.168.1.1  ,  10.0.0.1  ',
      });
      expect(getClientIp(request)).toBe('192.168.1.1');
    });

    it('rejects IP addresses exceeding max length', () => {
      const longIp = '1'.repeat(50);
      const request = createMockRequest({
        'x-forwarded-for': longIp,
        'x-real-ip': '192.168.1.1',
      });
      expect(getClientIp(request)).toBe('192.168.1.1');
    });

    it('validates IPv4 octets are within 0-255 range', () => {
      const request = createMockRequest({
        'x-forwarded-for': '256.1.1.1',
        'x-real-ip': '192.168.1.1',
      });
      expect(getClientIp(request)).toBe('192.168.1.1');
    });
  });

  describe('createIpRateLimiter', () => {
    it('allows requests within limit', () => {
      const limiter = createIpRateLimiter({
        maxRequests: 5,
        windowMs: 60000,
      });

      expect(() => limiter.check('192.168.1.1')).not.toThrow();
      expect(() => limiter.check('192.168.1.1')).not.toThrow();
      expect(() => limiter.check('192.168.1.1')).not.toThrow();
    });

    it('throws RateLimitError when limit exceeded', () => {
      const limiter = createIpRateLimiter({
        maxRequests: 2,
        windowMs: 60000,
      });

      limiter.check('192.168.1.1');
      limiter.check('192.168.1.1');

      expect(() => limiter.check('192.168.1.1')).toThrow(RateLimitError);
    });

    it('includes retryAfter in RateLimitError', () => {
      const limiter = createIpRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      });

      limiter.check('192.168.1.1');

      try {
        limiter.check('192.168.1.1');
        expect.fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).retryAfter).toBeGreaterThan(0);
        expect((error as RateLimitError).retryAfter).toBeLessThanOrEqual(60);
      }
    });

    it('tracks different IPs independently', () => {
      const limiter = createIpRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      });

      limiter.check('192.168.1.1');
      expect(() => limiter.check('192.168.1.1')).toThrow(RateLimitError);

      expect(() => limiter.check('192.168.1.2')).not.toThrow();
    });

    it('resets count after window expires', () => {
      vi.useFakeTimers();

      const limiter = createIpRateLimiter({
        maxRequests: 1,
        windowMs: 1000,
      });

      limiter.check('192.168.1.1');
      expect(() => limiter.check('192.168.1.1')).toThrow(RateLimitError);

      vi.advanceTimersByTime(1001);

      expect(() => limiter.check('192.168.1.1')).not.toThrow();

      vi.useRealTimers();
    });

    it('getRemainingRequests returns correct count', () => {
      const limiter = createIpRateLimiter({
        maxRequests: 5,
        windowMs: 60000,
      });

      expect(limiter.getRemainingRequests('192.168.1.1')).toBe(5);

      limiter.check('192.168.1.1');
      expect(limiter.getRemainingRequests('192.168.1.1')).toBe(4);

      limiter.check('192.168.1.1');
      limiter.check('192.168.1.1');
      expect(limiter.getRemainingRequests('192.168.1.1')).toBe(2);
    });

    it('getRemainingRequests returns 0 when limit exceeded', () => {
      const limiter = createIpRateLimiter({
        maxRequests: 2,
        windowMs: 60000,
      });

      limiter.check('192.168.1.1');
      limiter.check('192.168.1.1');

      expect(limiter.getRemainingRequests('192.168.1.1')).toBe(0);
    });

    it('reset clears count for specific IP', () => {
      const limiter = createIpRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      });

      limiter.check('192.168.1.1');
      expect(() => limiter.check('192.168.1.1')).toThrow(RateLimitError);

      limiter.reset('192.168.1.1');

      expect(() => limiter.check('192.168.1.1')).not.toThrow();
    });

    it('clear removes all tracked IPs', () => {
      const limiter = createIpRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      });

      limiter.check('192.168.1.1');
      limiter.check('192.168.1.2');

      expect(() => limiter.check('192.168.1.1')).toThrow(RateLimitError);
      expect(() => limiter.check('192.168.1.2')).toThrow(RateLimitError);

      limiter.clear();

      expect(() => limiter.check('192.168.1.1')).not.toThrow();
      expect(() => limiter.check('192.168.1.2')).not.toThrow();
    });
  });

  describe('checkIpRateLimit', () => {
    it('uses configured rate limit for endpoint type', () => {
      const healthConfig = IP_RATE_LIMIT_CONFIGS.health;
      const request = createMockRequest({
        'x-forwarded-for': '192.168.1.1',
      });

      for (let i = 0; i < healthConfig.maxRequests; i++) {
        expect(() => checkIpRateLimit(request, 'health')).not.toThrow();
      }

      expect(() => checkIpRateLimit(request, 'health')).toThrow(RateLimitError);
    });

    it('applies different limits for different endpoint types', () => {
      const request = createMockRequest({
        'x-forwarded-for': '192.168.1.1',
      });

      const authConfig = IP_RATE_LIMIT_CONFIGS.auth;
      for (let i = 0; i < authConfig.maxRequests; i++) {
        checkIpRateLimit(request, 'auth');
      }
      expect(() => checkIpRateLimit(request, 'auth')).toThrow(RateLimitError);

      expect(() => checkIpRateLimit(request, 'webhook')).not.toThrow();
    });
  });

  describe('getRateLimitHeaders', () => {
    it('returns correct rate limit headers', () => {
      const request = createMockRequest({
        'x-forwarded-for': '192.168.1.1',
      });

      const headers = getRateLimitHeaders(request, 'docs');
      const docsConfig = IP_RATE_LIMIT_CONFIGS.docs;

      expect(headers['X-RateLimit-Limit']).toBe(String(docsConfig.maxRequests));
      expect(headers['X-RateLimit-Remaining']).toBe(
        String(docsConfig.maxRequests)
      );
      expect(headers['X-RateLimit-Reset']).toBeDefined();
    });

    it('updates remaining count after requests', () => {
      const request = createMockRequest({
        'x-forwarded-for': '192.168.1.100',
      });

      checkIpRateLimit(request, 'publicApi');
      checkIpRateLimit(request, 'publicApi');

      const headers = getRateLimitHeaders(request, 'publicApi');
      const remaining = parseInt(headers['X-RateLimit-Remaining'], 10);

      expect(remaining).toBe(IP_RATE_LIMIT_CONFIGS.publicApi.maxRequests - 2);
    });
  });

  describe('IP_RATE_LIMIT_CONFIGS', () => {
    it('has expected endpoint types', () => {
      expect(IP_RATE_LIMIT_CONFIGS).toHaveProperty('health');
      expect(IP_RATE_LIMIT_CONFIGS).toHaveProperty('webhook');
      expect(IP_RATE_LIMIT_CONFIGS).toHaveProperty('publicApi');
      expect(IP_RATE_LIMIT_CONFIGS).toHaveProperty('auth');
      expect(IP_RATE_LIMIT_CONFIGS).toHaveProperty('docs');
      expect(IP_RATE_LIMIT_CONFIGS).toHaveProperty('internal');
    });

    it('auth has lowest limit (brute force protection)', () => {
      const authLimit = IP_RATE_LIMIT_CONFIGS.auth.maxRequests;

      expect(authLimit).toBeLessThan(IP_RATE_LIMIT_CONFIGS.health.maxRequests);
      expect(authLimit).toBeLessThan(IP_RATE_LIMIT_CONFIGS.webhook.maxRequests);
      expect(authLimit).toBeLessThan(
        IP_RATE_LIMIT_CONFIGS.publicApi.maxRequests
      );
      expect(authLimit).toBeLessThan(IP_RATE_LIMIT_CONFIGS.docs.maxRequests);
    });

    it('webhook has highest limit (payment processors)', () => {
      const webhookLimit = IP_RATE_LIMIT_CONFIGS.webhook.maxRequests;

      expect(webhookLimit).toBeGreaterThanOrEqual(
        IP_RATE_LIMIT_CONFIGS.health.maxRequests
      );
      expect(webhookLimit).toBeGreaterThan(
        IP_RATE_LIMIT_CONFIGS.publicApi.maxRequests
      );
      expect(webhookLimit).toBeGreaterThan(
        IP_RATE_LIMIT_CONFIGS.auth.maxRequests
      );
    });
  });
});
