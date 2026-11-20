import { RateLimitError } from '@/lib/api/errors';
import {
  checkIpRateLimit,
  clearAllRateLimiters,
  createIpRateLimiter,
  getClientIp,
  IP_RATE_LIMIT_CONFIGS,
} from '@/lib/api/ip-rate-limit';
import { logger } from '@/lib/logging/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createMockRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/test', {
    headers,
  });
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
        }),
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
        }),
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
        }),
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
        }),
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
      // A scoped IPv6 address that net.isIP accepts, so only the length cap rejects it.
      const longIp = `fe80::1%${'a'.repeat(40)}`;
      const request = createMockRequest({
        'x-forwarded-for': longIp,
        'x-real-ip': '192.168.1.1',
      });
      expect(getClientIp(request)).toBe('192.168.1.1');
    });
  });

  describe('createIpRateLimiter', () => {
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

      const docsConfig = IP_RATE_LIMIT_CONFIGS.docs;
      for (let i = 0; i < docsConfig.maxRequests; i++) {
        checkIpRateLimit(request, 'docs');
      }
      expect(() => checkIpRateLimit(request, 'docs')).toThrow(RateLimitError);

      expect(() => checkIpRateLimit(request, 'webhook')).not.toThrow();
    });
  });

  describe('IP_RATE_LIMIT_CONFIGS', () => {
    it('webhook has highest limit (payment processors)', () => {
      const webhookLimit = IP_RATE_LIMIT_CONFIGS.webhook.maxRequests;

      expect(webhookLimit).toBeGreaterThanOrEqual(
        IP_RATE_LIMIT_CONFIGS.health.maxRequests,
      );
      expect(webhookLimit).toBeGreaterThan(
        IP_RATE_LIMIT_CONFIGS.publicApi.maxRequests,
      );
      expect(webhookLimit).toBeGreaterThan(
        IP_RATE_LIMIT_CONFIGS.docs.maxRequests,
      );
    });
  });
});
