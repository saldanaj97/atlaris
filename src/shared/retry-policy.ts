/**
 * Pure job-queue retry policy: eligibility + backoff delay.
 * Used by queue persistence and regeneration orchestration.
 */
import {
  JOB_RETRY_BASE_SECONDS,
  JOB_RETRY_MAX_DELAY_SECONDS,
} from '@/shared/constants/retry-policy';

export type JobRetryDecision =
  | {
      shouldRetry: true;
      delayMs: number;
      reason: string;
    }
  | {
      shouldRetry: false;
      reason: string;
    };

/**
 * Backoff for the Nth failure that will become `attempts` after this fail (1-based).
 * Matches historical queue formula: base * 2^(n-1), capped, truncated attempt >= 1.
 */
export function getJobRetryDelayMs(
  attemptNumber: number,
  random: () => number = Math.random,
): number {
  const normalizedAttempt = Math.max(1, Math.trunc(attemptNumber));
  const delaySeconds = Math.min(
    JOB_RETRY_MAX_DELAY_SECONDS,
    JOB_RETRY_BASE_SECONDS * 2 ** (normalizedAttempt - 1),
  );
  const baseMs = delaySeconds * 1000;
  const factor = 0.75 + random() * 0.5;
  return Math.round(baseMs * factor);
}

/**
 * `retryable === false` never schedules retry.
 * `retryable === true` or `undefined` retries while `attemptNumber < maxAttempts`.
 */
export function decideJobRetry(params: {
  attemptNumber: number;
  maxAttempts: number;
  retryable: boolean | undefined;
}): JobRetryDecision {
  if (params.retryable === false) {
    return { shouldRetry: false, reason: 'job_retry:not_retryable' };
  }
  if (params.attemptNumber >= params.maxAttempts) {
    return {
      shouldRetry: false,
      reason: `job_retry:attempt_cap:${params.attemptNumber}/${params.maxAttempts}`,
    };
  }
  const delayMs = getJobRetryDelayMs(params.attemptNumber);
  return {
    shouldRetry: true,
    delayMs,
    reason: `job_retry:scheduled:${params.attemptNumber}/${params.maxAttempts}`,
  };
}
