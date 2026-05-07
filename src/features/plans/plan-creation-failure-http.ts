import type { FailureClassification } from '@/shared/types/failure-classification.types';

/**
 * HTTP status + stable `AppError` code per plan-creation failure classification.
 * Single source for REST handlers and the plan generation session boundary.
 */
export const PLAN_CREATION_FAILURE_HTTP_MAP: Record<
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
