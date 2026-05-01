import { afterEach, describe, expect, it, vi } from 'vitest';

import { decideJobRetry, getJobRetryDelayMs } from '@/shared/retry-policy';
import {
  JOB_RETRY_BASE_SECONDS,
  JOB_RETRY_MAX_DELAY_SECONDS,
  MAX_JOB_RETRIES,
  MAX_PROVIDER_RETRIES,
  MAX_TOTAL_AI_CALLS_PER_JOB,
} from '@/shared/constants/retry-policy';

describe('shared retry-policy', () => {
  describe('decideJobRetry', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns shouldRetry=true when retryable and under max attempts', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const result = decideJobRetry({
        attemptNumber: 1,
        maxAttempts: 3,
        retryable: true,
      });

      expect(result.shouldRetry).toBe(true);
      if (!result.shouldRetry) {
        throw new Error('Expected retry decision');
      }
      expect(result.delayMs).toBeGreaterThan(0);
      expect(result.reason).toContain('job_retry:scheduled');
    });

    it('treats undefined retryable like retryable for attempt cap', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const result = decideJobRetry({
        attemptNumber: 1,
        maxAttempts: 3,
        retryable: undefined,
      });
      expect(result.shouldRetry).toBe(true);
      if (!result.shouldRetry) {
        throw new Error('Expected retry decision');
      }
      expect(result.delayMs).toBe(getJobRetryDelayMs(1, () => 0.5));
    });

    it('returns shouldRetry=false when retryable but at max attempts', () => {
      const result = decideJobRetry({
        attemptNumber: 3,
        maxAttempts: 3,
        retryable: true,
      });

      expect(result.shouldRetry).toBe(false);
      expect(result.reason).toContain('job_retry:attempt_cap');
      expect('delayMs' in result).toBe(false);
    });

    it('returns shouldRetry=false when retryable but past max attempts', () => {
      const result = decideJobRetry({
        attemptNumber: 5,
        maxAttempts: 3,
        retryable: true,
      });

      expect(result.shouldRetry).toBe(false);
      expect(result.reason).toContain('job_retry:attempt_cap');
    });

    it('returns shouldRetry=false when not retryable regardless of attempts', () => {
      const result = decideJobRetry({
        attemptNumber: 1,
        maxAttempts: 10,
        retryable: false,
      });

      expect(result.shouldRetry).toBe(false);
      expect(result.reason).toContain('job_retry:not_retryable');
    });

    it('includes delayMs in successful retry decisions', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const result = decideJobRetry({
        attemptNumber: 2,
        maxAttempts: 5,
        retryable: true,
      });

      expect(result.shouldRetry).toBe(true);
      if (!result.shouldRetry) {
        throw new Error('Expected retry decision');
      }
      expect(result.delayMs).toBe(getJobRetryDelayMs(2, () => 0.5));
    });

    it('does not include delayMs when shouldRetry is false (not retryable)', () => {
      const result = decideJobRetry({
        attemptNumber: 1,
        maxAttempts: 3,
        retryable: false,
      });

      expect('delayMs' in result).toBe(false);
    });
  });

  describe('getJobRetryDelayMs', () => {
    const mid = (): number => 0.5;

    it.each([
      [1, JOB_RETRY_BASE_SECONDS * 1000],
      [2, JOB_RETRY_BASE_SECONDS * 2 * 1000],
      [3, JOB_RETRY_BASE_SECONDS * 4 * 1000],
    ])('computes exponential backoff for attempt %i', (attempt, expectedMs) => {
      expect(getJobRetryDelayMs(attempt, mid)).toBe(expectedMs);
    });

    it('applies ~±25% jitter via random factor', () => {
      const nominal = JOB_RETRY_BASE_SECONDS * 1000;
      expect(getJobRetryDelayMs(1, () => 0)).toBe(Math.round(nominal * 0.75));
      expect(getJobRetryDelayMs(1, () => 0.5)).toBe(nominal);
      expect(getJobRetryDelayMs(1, () => 1 - Number.EPSILON)).toBe(
        Math.round(nominal * 1.25),
      );
    });

    it('caps delay at JOB_RETRY_MAX_DELAY_SECONDS (before jitter)', () => {
      const maxDelayMs = JOB_RETRY_MAX_DELAY_SECONDS * 1000;

      expect(getJobRetryDelayMs(100, mid)).toBe(maxDelayMs);
      expect(getJobRetryDelayMs(20, mid)).toBe(maxDelayMs);
    });

    it('does not exceed ~125% of configured max delay', () => {
      const maxDelayMs = JOB_RETRY_MAX_DELAY_SECONDS * 1000;
      const ceiling = Math.ceil(maxDelayMs * 1.25) + 2;

      for (let attempt = 1; attempt <= 50; attempt++) {
        expect(getJobRetryDelayMs(attempt)).toBeLessThanOrEqual(ceiling);
      }
    });
  });

  describe('constant invariants', () => {
    it('MAX_TOTAL_AI_CALLS_PER_JOB = MAX_JOB_RETRIES * (MAX_PROVIDER_RETRIES + 1)', () => {
      expect(MAX_TOTAL_AI_CALLS_PER_JOB).toBe(
        MAX_JOB_RETRIES * (MAX_PROVIDER_RETRIES + 1),
      );
    });

    it('MAX_JOB_RETRIES is a reasonable bound (not 100)', () => {
      expect(MAX_JOB_RETRIES).toBeLessThanOrEqual(10);
      expect(MAX_JOB_RETRIES).toBeGreaterThanOrEqual(1);
    });
  });
});
