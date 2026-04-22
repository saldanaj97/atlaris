import { describe, expect, it } from 'vitest';

import {
	computeEffectiveMaxAttempts,
	getRetryDelay,
	JOB_RETRY_BASE_SECONDS,
	JOB_RETRY_MAX_DELAY_SECONDS,
	MAX_JOB_RETRIES,
	MAX_PROVIDER_RETRIES,
	MAX_TOTAL_AI_CALLS_PER_JOB,
	shouldRetryJob,
} from '@/features/plans/retry-policy';

describe('retry-policy', () => {
	describe('shouldRetryJob', () => {
		it('returns shouldRetry=true when retryable and under max attempts', () => {
			const result = shouldRetryJob({
				attemptNumber: 1,
				maxAttempts: 3,
				retryable: true,
			});

			expect(result.shouldRetry).toBe(true);
			expect(result.delay).toBeGreaterThan(0);
			expect(result.reason).toContain('Retryable');
		});

		it('returns shouldRetry=false when retryable but at max attempts', () => {
			const result = shouldRetryJob({
				attemptNumber: 3,
				maxAttempts: 3,
				retryable: true,
			});

			expect(result.shouldRetry).toBe(false);
			expect(result.reason).toContain('Attempt cap reached');
		});

		it('returns shouldRetry=false when retryable but past max attempts', () => {
			const result = shouldRetryJob({
				attemptNumber: 5,
				maxAttempts: 3,
				retryable: true,
			});

			expect(result.shouldRetry).toBe(false);
			expect(result.reason).toContain('Attempt cap reached');
		});

		it('returns shouldRetry=false when not retryable regardless of attempts', () => {
			const result = shouldRetryJob({
				attemptNumber: 1,
				maxAttempts: 10,
				retryable: false,
			});

			expect(result.shouldRetry).toBe(false);
			expect(result.reason).toContain('not retryable');
		});

		it('includes delay in successful retry decisions', () => {
			const result = shouldRetryJob({
				attemptNumber: 2,
				maxAttempts: 5,
				retryable: true,
			});

			expect(result.shouldRetry).toBe(true);
			expect(result.delay).toBe(getRetryDelay(2));
		});

		it('does not include delay when shouldRetry is false', () => {
			const result = shouldRetryJob({
				attemptNumber: 1,
				maxAttempts: 3,
				retryable: false,
			});

			expect(result.delay).toBeUndefined();
		});
	});

	describe('getRetryDelay', () => {
		it('computes exponential backoff', () => {
			expect(getRetryDelay(1)).toBe(JOB_RETRY_BASE_SECONDS ** 1 * 1000);
			expect(getRetryDelay(2)).toBe(JOB_RETRY_BASE_SECONDS ** 2 * 1000);
			expect(getRetryDelay(3)).toBe(JOB_RETRY_BASE_SECONDS ** 3 * 1000);
		});

		it('caps delay at JOB_RETRY_MAX_DELAY_SECONDS', () => {
			const maxDelayMs = JOB_RETRY_MAX_DELAY_SECONDS * 1000;

			// A very high attempt number should be capped
			expect(getRetryDelay(100)).toBe(maxDelayMs);
			expect(getRetryDelay(20)).toBe(maxDelayMs);
		});

		it('does not exceed 300 seconds (5 minutes)', () => {
			for (let attempt = 1; attempt <= 50; attempt++) {
				expect(getRetryDelay(attempt)).toBeLessThanOrEqual(300_000);
			}
		});
	});

	describe('computeEffectiveMaxAttempts', () => {
		it('returns baseMax when retryableOverride is true', () => {
			expect(computeEffectiveMaxAttempts(3, true)).toBe(3);
		});

		it('returns baseMax when retryableOverride is undefined', () => {
			expect(computeEffectiveMaxAttempts(5)).toBe(5);
		});

		it('returns 1 when retryableOverride is false', () => {
			expect(computeEffectiveMaxAttempts(10, false)).toBe(1);
		});

		it('never returns 100 (old ABSOLUTE_MAX_ATTEMPTS)', () => {
			// This is the critical regression test: retryable=true must NOT escalate to 100
			expect(computeEffectiveMaxAttempts(3, true)).toBe(3);
			expect(computeEffectiveMaxAttempts(3, true)).not.toBe(100);
		});
	});

	describe('constant invariants', () => {
		it('MAX_TOTAL_AI_CALLS_PER_JOB = MAX_JOB_RETRIES * (MAX_PROVIDER_RETRIES + 1)', () => {
			expect(MAX_TOTAL_AI_CALLS_PER_JOB).toBe(
				MAX_JOB_RETRIES * (MAX_PROVIDER_RETRIES + 1),
			);
		});

		it('MAX_TOTAL_AI_CALLS_PER_JOB equals 6', () => {
			expect(MAX_TOTAL_AI_CALLS_PER_JOB).toBe(6);
		});

		it('total AI calls per regeneration is bounded by MAX_TOTAL_AI_CALLS_PER_JOB', () => {
			// Simulate worst case: every job attempt triggers max provider retries
			const totalProviderCallsPerAttempt = MAX_PROVIDER_RETRIES + 1;
			const totalCalls = MAX_JOB_RETRIES * totalProviderCallsPerAttempt;

			expect(totalCalls).toBe(MAX_TOTAL_AI_CALLS_PER_JOB);
			expect(totalCalls).toBeLessThanOrEqual(MAX_TOTAL_AI_CALLS_PER_JOB);
		});

		it('MAX_JOB_RETRIES is a reasonable bound (not 100)', () => {
			expect(MAX_JOB_RETRIES).toBeLessThanOrEqual(10);
			expect(MAX_JOB_RETRIES).toBeGreaterThanOrEqual(1);
		});
	});
});
