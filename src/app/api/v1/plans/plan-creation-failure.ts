import type {
  FailureClassification,
  PermanentFailure,
  RetryableFailure,
} from '@/features/plans/lifecycle/types';
import { AppError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';

const classificationMap: Record<
  FailureClassification | 'unknown',
  { status: number; code: string }
> = {
  validation: { status: 400, code: 'PLAN_CREATION_VALIDATION_FAILED' },
  capped: { status: 403, code: 'PLAN_CREATION_CAPPED' },
  conflict: { status: 409, code: 'PLAN_CREATION_CONFLICT' },
  rate_limit: { status: 429, code: 'PLAN_CREATION_RATE_LIMITED' },
  timeout: { status: 504, code: 'PLAN_CREATION_TIMEOUT' },
  provider_error: { status: 503, code: 'PLAN_CREATION_PROVIDER_ERROR' },
  unknown: { status: 500, code: 'PLAN_CREATION_FAILED' },
};

const defaultMapping = { status: 500, code: 'PLAN_CREATION_FAILED' } as const;

/**
 * Maps topic plan creation permanent or retryable failures to HTTP errors.
 */
export function throwPlanCreationFailureError(
  createResult: PermanentFailure | RetryableFailure
): never {
  const err =
    'error' in createResult
      ? createResult.error
      : new Error('Plan creation failed');

  const { status, code } =
    classificationMap[createResult.classification] ?? defaultMapping;

  logger.warn(
    {
      status: createResult.status,
      classification: createResult.classification,
      error: err.message,
    },
    'Plan creation failure'
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
