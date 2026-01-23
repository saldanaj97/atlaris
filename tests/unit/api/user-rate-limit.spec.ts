import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  checkUserRateLimit,
  clearAllUserRateLimiters,
  createUserRateLimiter,
  getUserRateLimitHeaders,
  resetUserRateLimits,
  USER_RATE_LIMIT_CONFIGS,
} from '@/lib/api/user-rate-limit';
import { RateLimitError } from '@/lib/api/errors';

describe('User Rate Limiting', () => {
  beforeEach(() => {
    clearAllUserRateLimiters();
  });

  afterEach(() => {
    clearAllUserRateLimiters();
  });

  describe('createUserRateLimiter', () => {
    it('allows requests within limit', () => {
      const limiter = createUserRateLimiter({
        maxRequests: 5,
        windowMs: 60000,
      });

      expect(() => limiter.check('user_123')).not.toThrow();
      expect(() => limiter.check('user_123')).not.toThrow();
      expect(() => limiter.check('user_123')).not.toThrow();
    });

    it('throws RateLimitError when limit exceeded', () => {
      const limiter = createUserRateLimiter({
        maxRequests: 2,
        windowMs: 60000,
      });

      limiter.check('user_123');
      limiter.check('user_123');

      expect(() => limiter.check('user_123')).toThrow(RateLimitError);
    });

    it('includes retryAfter in RateLimitError', () => {
      const limiter = createUserRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      });

      limiter.check('user_123');

      try {
        limiter.check('user_123');
        expect.fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).retryAfter).toBeGreaterThan(0);
        expect((error as RateLimitError).retryAfter).toBeLessThanOrEqual(60);
      }
    });

    it('tracks different users independently', () => {
      const limiter = createUserRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      });

      limiter.check('user_123');
      expect(() => limiter.check('user_123')).toThrow(RateLimitError);

      expect(() => limiter.check('user_456')).not.toThrow();
    });

    it('resets count after window expires', () => {
      vi.useFakeTimers();

      const limiter = createUserRateLimiter({
        maxRequests: 1,
        windowMs: 1000,
      });

      limiter.check('user_123');
      expect(() => limiter.check('user_123')).toThrow(RateLimitError);

      vi.advanceTimersByTime(1001);

      expect(() => limiter.check('user_123')).not.toThrow();

      vi.useRealTimers();
    });

    it('getRemainingRequests returns correct count', () => {
      const limiter = createUserRateLimiter({
        maxRequests: 5,
        windowMs: 60000,
      });

      expect(limiter.getRemainingRequests('user_123')).toBe(5);

      limiter.check('user_123');
      expect(limiter.getRemainingRequests('user_123')).toBe(4);

      limiter.check('user_123');
      limiter.check('user_123');
      expect(limiter.getRemainingRequests('user_123')).toBe(2);
    });

    it('getRemainingRequests returns 0 when limit exceeded', () => {
      const limiter = createUserRateLimiter({
        maxRequests: 2,
        windowMs: 60000,
      });

      limiter.check('user_123');
      limiter.check('user_123');

      expect(limiter.getRemainingRequests('user_123')).toBe(0);
    });

    it('getRemainingRequests returns full count after window expires', () => {
      vi.useFakeTimers();

      const limiter = createUserRateLimiter({
        maxRequests: 5,
        windowMs: 1000,
      });

      limiter.check('user_123');
      limiter.check('user_123');
      expect(limiter.getRemainingRequests('user_123')).toBe(3);

      vi.advanceTimersByTime(1001);

      expect(limiter.getRemainingRequests('user_123')).toBe(5);

      vi.useRealTimers();
    });

    it('getResetTime returns timestamp in the future', () => {
      const limiter = createUserRateLimiter({
        maxRequests: 5,
        windowMs: 60000,
      });

      limiter.check('user_123');

      const resetTime = limiter.getResetTime('user_123');
      const nowSeconds = Math.ceil(Date.now() / 1000);

      expect(resetTime).toBeGreaterThan(nowSeconds);
      expect(resetTime).toBeLessThanOrEqual(nowSeconds + 60);
    });

    it('reset clears count for specific user', () => {
      const limiter = createUserRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      });

      limiter.check('user_123');
      expect(() => limiter.check('user_123')).toThrow(RateLimitError);

      limiter.reset('user_123');

      expect(() => limiter.check('user_123')).not.toThrow();
    });

    it('reset does not affect other users', () => {
      const limiter = createUserRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      });

      limiter.check('user_123');
      limiter.check('user_456');

      limiter.reset('user_123');

      expect(() => limiter.check('user_123')).not.toThrow();
      expect(() => limiter.check('user_456')).toThrow(RateLimitError);
    });

    it('clear removes all tracked users', () => {
      const limiter = createUserRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      });

      limiter.check('user_123');
      limiter.check('user_456');

      expect(() => limiter.check('user_123')).toThrow(RateLimitError);
      expect(() => limiter.check('user_456')).toThrow(RateLimitError);

      limiter.clear();

      expect(() => limiter.check('user_123')).not.toThrow();
      expect(() => limiter.check('user_456')).not.toThrow();
    });
  });

  describe('checkUserRateLimit', () => {
    it('uses configured rate limit for category', () => {
      const readConfig = USER_RATE_LIMIT_CONFIGS.read;

      for (let i = 0; i < readConfig.maxRequests; i++) {
        expect(() => checkUserRateLimit('user_123', 'read')).not.toThrow();
      }

      expect(() => checkUserRateLimit('user_123', 'read')).toThrow(
        RateLimitError
      );
    });

    it('applies different limits for different categories', () => {
      const billingConfig = USER_RATE_LIMIT_CONFIGS.billing;
      for (let i = 0; i < billingConfig.maxRequests; i++) {
        checkUserRateLimit('user_123', 'billing');
      }
      expect(() => checkUserRateLimit('user_123', 'billing')).toThrow(
        RateLimitError
      );

      expect(() => checkUserRateLimit('user_123', 'read')).not.toThrow();
    });

    it('tracks same user across different categories independently', () => {
      const billingConfig = USER_RATE_LIMIT_CONFIGS.billing;

      for (let i = 0; i < billingConfig.maxRequests; i++) {
        checkUserRateLimit('user_123', 'billing');
      }

      expect(() => checkUserRateLimit('user_123', 'billing')).toThrow(
        RateLimitError
      );
      expect(() => checkUserRateLimit('user_123', 'mutation')).not.toThrow();
      expect(() => checkUserRateLimit('user_123', 'read')).not.toThrow();
    });
  });

  describe('getUserRateLimitHeaders', () => {
    it('returns correct rate limit headers', () => {
      const headers = getUserRateLimitHeaders('user_123', 'read');
      const readConfig = USER_RATE_LIMIT_CONFIGS.read;

      expect(headers['X-RateLimit-Limit']).toBe(String(readConfig.maxRequests));
      expect(headers['X-RateLimit-Remaining']).toBe(
        String(readConfig.maxRequests)
      );
      expect(headers['X-RateLimit-Reset']).toBeDefined();
    });

    it('updates remaining count after requests', () => {
      checkUserRateLimit('user_456', 'mutation');
      checkUserRateLimit('user_456', 'mutation');

      const headers = getUserRateLimitHeaders('user_456', 'mutation');
      const remaining = parseInt(headers['X-RateLimit-Remaining'], 10);

      expect(remaining).toBe(USER_RATE_LIMIT_CONFIGS.mutation.maxRequests - 2);
    });

    it('returns X-RateLimit-Reset as Unix timestamp', () => {
      const headers = getUserRateLimitHeaders('user_789', 'aiGeneration');
      const resetTime = parseInt(headers['X-RateLimit-Reset'], 10);
      const nowSeconds = Math.ceil(Date.now() / 1000);

      expect(resetTime).toBeGreaterThan(nowSeconds);
    });
  });

  describe('resetUserRateLimits', () => {
    it('resets rate limits for user across all categories', () => {
      checkUserRateLimit('user_123', 'read');
      checkUserRateLimit('user_123', 'mutation');

      let readHeaders = getUserRateLimitHeaders('user_123', 'read');
      let mutationHeaders = getUserRateLimitHeaders('user_123', 'mutation');

      expect(parseInt(readHeaders['X-RateLimit-Remaining'], 10)).toBeLessThan(
        USER_RATE_LIMIT_CONFIGS.read.maxRequests
      );
      expect(
        parseInt(mutationHeaders['X-RateLimit-Remaining'], 10)
      ).toBeLessThan(USER_RATE_LIMIT_CONFIGS.mutation.maxRequests);

      resetUserRateLimits('user_123');

      readHeaders = getUserRateLimitHeaders('user_123', 'read');
      mutationHeaders = getUserRateLimitHeaders('user_123', 'mutation');

      expect(parseInt(readHeaders['X-RateLimit-Remaining'], 10)).toBe(
        USER_RATE_LIMIT_CONFIGS.read.maxRequests
      );
      expect(parseInt(mutationHeaders['X-RateLimit-Remaining'], 10)).toBe(
        USER_RATE_LIMIT_CONFIGS.mutation.maxRequests
      );
    });

    it('does not affect other users', () => {
      checkUserRateLimit('user_123', 'read');
      checkUserRateLimit('user_456', 'read');

      resetUserRateLimits('user_123');

      const user123Headers = getUserRateLimitHeaders('user_123', 'read');
      const user456Headers = getUserRateLimitHeaders('user_456', 'read');

      expect(parseInt(user123Headers['X-RateLimit-Remaining'], 10)).toBe(
        USER_RATE_LIMIT_CONFIGS.read.maxRequests
      );
      expect(parseInt(user456Headers['X-RateLimit-Remaining'], 10)).toBe(
        USER_RATE_LIMIT_CONFIGS.read.maxRequests - 1
      );
    });
  });

  describe('USER_RATE_LIMIT_CONFIGS', () => {
    it('has expected categories', () => {
      expect(USER_RATE_LIMIT_CONFIGS).toHaveProperty('aiGeneration');
      expect(USER_RATE_LIMIT_CONFIGS).toHaveProperty('integration');
      expect(USER_RATE_LIMIT_CONFIGS).toHaveProperty('mutation');
      expect(USER_RATE_LIMIT_CONFIGS).toHaveProperty('read');
      expect(USER_RATE_LIMIT_CONFIGS).toHaveProperty('billing');
      expect(USER_RATE_LIMIT_CONFIGS).toHaveProperty('oauth');
    });

    it('aiGeneration has lowest limit (expensive AI calls)', () => {
      const aiLimit = USER_RATE_LIMIT_CONFIGS.aiGeneration.maxRequests;

      expect(aiLimit).toBeLessThanOrEqual(
        USER_RATE_LIMIT_CONFIGS.integration.maxRequests
      );
      expect(aiLimit).toBeLessThan(
        USER_RATE_LIMIT_CONFIGS.mutation.maxRequests
      );
      expect(aiLimit).toBeLessThan(USER_RATE_LIMIT_CONFIGS.read.maxRequests);
    });

    it('read has highest limit (cheap operations)', () => {
      const readLimit = USER_RATE_LIMIT_CONFIGS.read.maxRequests;

      expect(readLimit).toBeGreaterThan(
        USER_RATE_LIMIT_CONFIGS.aiGeneration.maxRequests
      );
      expect(readLimit).toBeGreaterThan(
        USER_RATE_LIMIT_CONFIGS.integration.maxRequests
      );
      expect(readLimit).toBeGreaterThan(
        USER_RATE_LIMIT_CONFIGS.mutation.maxRequests
      );
      expect(readLimit).toBeGreaterThan(
        USER_RATE_LIMIT_CONFIGS.billing.maxRequests
      );
    });

    it('all configs have valid maxRequests and windowMs', () => {
      for (const [_category, config] of Object.entries(
        USER_RATE_LIMIT_CONFIGS
      )) {
        expect(config.maxRequests).toBeGreaterThan(0);
        expect(config.windowMs).toBeGreaterThan(0);
        expect(Number.isInteger(config.maxRequests)).toBe(true);
        expect(Number.isInteger(config.windowMs)).toBe(true);
      }
    });
  });

  describe('error message formatting', () => {
    it('includes human-readable window duration in error message', () => {
      const limiter = createUserRateLimiter({
        maxRequests: 1,
        windowMs: 60 * 60 * 1000,
      });

      limiter.check('user_123');

      try {
        limiter.check('user_123');
        expect.fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).message).toContain('hour');
      }
    });

    it('formats minute windows correctly', () => {
      const limiter = createUserRateLimiter({
        maxRequests: 1,
        windowMs: 60 * 1000,
      });

      limiter.check('user_123');

      try {
        limiter.check('user_123');
        expect.fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).message).toContain('minute');
      }
    });

    it('includes max requests in error message', () => {
      const limiter = createUserRateLimiter({
        maxRequests: 5,
        windowMs: 60000,
      });

      for (let i = 0; i < 5; i++) {
        limiter.check('user_123');
      }

      try {
        limiter.check('user_123');
        expect.fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).message).toContain('5');
      }
    });
  });
});
