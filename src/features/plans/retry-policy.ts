/**
 * Centralized retry policy for plan generation.
 *
 * Constants live in @/shared/constants/retry-policy so both lib/ and features/
 * layers can import them. This module re-exports them and adds decision functions.
 */
export {
	JOB_RETRY_BASE_SECONDS,
	JOB_RETRY_MAX_DELAY_SECONDS,
	MAX_JOB_RETRIES,
	MAX_PROVIDER_RETRIES,
	MAX_TOTAL_AI_CALLS_PER_JOB,
	PROVIDER_RETRY_MAX_MS,
	PROVIDER_RETRY_MIN_MS,
} from '@/shared/constants/retry-policy';

import {
	JOB_RETRY_BASE_SECONDS,
	JOB_RETRY_MAX_DELAY_SECONDS,
} from '@/shared/constants/retry-policy';

interface RetryDecision {
	shouldRetry: boolean;
	delay?: number; // ms
	reason: string;
}

/**
 * Determines whether a job should be retried based on its attempt count
 * and the classification of the failure.
 */
export function shouldRetryJob(params: {
	attemptNumber: number; // current attempt (1-based)
	maxAttempts: number; // configured max for this job
	retryable: boolean; // whether the failure is classified as retryable
}): RetryDecision {
	if (!params.retryable) {
		return { shouldRetry: false, reason: 'Permanent failure — not retryable' };
	}
	if (params.attemptNumber >= params.maxAttempts) {
		return {
			shouldRetry: false,
			reason: `Attempt cap reached (${params.attemptNumber}/${params.maxAttempts})`,
		};
	}
	const delay = getRetryDelay(params.attemptNumber);
	return {
		shouldRetry: true,
		delay,
		reason: `Retryable — attempt ${params.attemptNumber}/${params.maxAttempts}`,
	};
}

/**
 * Computes exponential backoff delay for job retries.
 */
export function getRetryDelay(attemptNumber: number): number {
	const delaySeconds = Math.min(
		JOB_RETRY_MAX_DELAY_SECONDS,
		JOB_RETRY_BASE_SECONDS ** attemptNumber,
	);
	return delaySeconds * 1000;
}

/**
 * Computes the effective max attempts, replacing the dangerous
 * ABSOLUTE_MAX_ATTEMPTS fallback with bounded semantics.
 *
 * Previously: retryable=true → ABSOLUTE_MAX_ATTEMPTS(100)
 * Now: retryable=true → baseMax (default MAX_JOB_RETRIES)
 */
export function computeEffectiveMaxAttempts(
	baseMax: number,
	retryableOverride?: boolean,
): number {
	if (retryableOverride === false) return 1; // One attempt, no retries
	return baseMax;
}
