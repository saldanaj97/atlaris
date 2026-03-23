import type {
  PermanentFailure,
  RetryableFailure,
} from '@/features/plans/lifecycle/types';
import { AppError } from '@/lib/api/errors';

/**
 * Maps PDF/topic plan creation permanent or retryable failures to HTTP errors.
 */
export function throwPlanCreationFailureError(
  createResult: PermanentFailure | RetryableFailure
): never {
  const err =
    'error' in createResult
      ? createResult.error
      : new Error('Plan creation failed');
  const isRetryable = createResult.status === 'retryable_failure';
  throw new AppError(err.message, {
    status: isRetryable ? 503 : 400,
    code: isRetryable
      ? 'PLAN_CREATION_TEMPORARY_FAILURE'
      : 'PLAN_CREATION_FAILED',
  });
}
