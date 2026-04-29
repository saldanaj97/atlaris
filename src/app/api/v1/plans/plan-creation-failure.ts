import type {
  PermanentFailure,
  RetryableFailure,
} from '@/features/plans/lifecycle/types';
import { PLAN_CREATION_FAILURE_HTTP_MAP } from '@/features/plans/plan-creation-failure-http';
import { AppError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';

/**
 * Maps topic plan creation permanent or retryable failures to HTTP errors.
 */
export function throwPlanCreationFailureError(
  createResult: PermanentFailure | RetryableFailure,
): never {
  const err =
    'error' in createResult
      ? createResult.error
      : new Error('Plan creation failed');

  const { status, code } =
    PLAN_CREATION_FAILURE_HTTP_MAP[createResult.classification] ??
    PLAN_CREATION_FAILURE_HTTP_MAP.unknown;

  logger.warn(
    {
      status: createResult.status,
      classification: createResult.classification,
      error: err.message,
    },
    'Plan creation failure',
  );

  throw new AppError(err.message, {
    status,
    code,
    classification:
      createResult.classification === 'unknown'
        ? undefined
        : createResult.classification,
    cause: err,
  });
}
