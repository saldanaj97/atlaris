import { PLAN_CREATION_FAILURE_HTTP_MAP } from '@/features/plans/plan-creation-failure-http';
import { AppError, AttemptCapExceededError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';
import type { FailureClassification } from '@/shared/types/failure-classification.types';

import type {
  CreatePlanResult,
  PermanentFailure,
  RetryableFailure,
} from '@/features/plans/lifecycle/types';

export function throwCreatePlanResultError(
  createResult: Exclude<CreatePlanResult, { status: 'success' }>,
): never {
  if (createResult.status === 'duplicate_detected') {
    throw new AppError(
      'A plan with this topic is already being generated. Please wait for it to complete.',
      {
        status: 409,
        code: 'DUPLICATE_PLAN',
        details: { existingPlanId: createResult.existingPlanId },
      },
    );
  }

  if (createResult.status === 'quota_rejected') {
    throw new AppError(createResult.reason, {
      status: 403,
      code: 'QUOTA_EXCEEDED',
      details: { upgradeUrl: createResult.upgradeUrl },
    });
  }

  if (createResult.status === 'attempt_cap_exceeded') {
    throw new AttemptCapExceededError(createResult.reason, {
      planId: createResult.cappedPlanId,
    });
  }

  throwPlanCreationFailure(createResult);
}

function throwPlanCreationFailure(
  createResult: PermanentFailure | RetryableFailure,
): never {
  const error = createResult.error;
  const { status, code } =
    PLAN_CREATION_FAILURE_HTTP_MAP[createResult.classification] ??
    PLAN_CREATION_FAILURE_HTTP_MAP.unknown;

  logger.warn(
    {
      status: createResult.status,
      classification: createResult.classification,
      error,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    },
    'Plan creation failure',
  );

  throw new AppError(
    toSafePlanCreationFailureMessage(createResult.classification),
    {
      status,
      code,
      classification:
        createResult.classification === 'unknown'
          ? undefined
          : createResult.classification,
      cause: error,
    },
  );
}

function toSafePlanCreationFailureMessage(
  classification: FailureClassification | 'unknown',
): string {
  switch (classification) {
    case 'validation':
      return 'The plan request could not be validated.';
    case 'conflict':
      return 'A plan generation request is already in progress.';
    case 'rate_limit':
      return 'Too many plan generation requests. Please try again later.';
    case 'timeout':
      return 'Plan generation timed out. Please try again.';
    case 'provider_error':
      return 'Plan generation is temporarily unavailable. Please try again.';
    case 'capped':
      return 'This plan cannot be generated because the attempt limit was reached.';
    default:
      return 'Plan creation failed. Please try again.';
  }
}
