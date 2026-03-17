// Plan-specific error classes
//
// Moved from features/billing/errors.ts — these errors represent plan domain
// operations (quota enforcement, creation failures), not billing infrastructure.

import { AppError } from '@/lib/api/errors';

/**
 * Error thrown when a user has reached their plan limit for their subscription tier.
 */
export class PlanLimitReachedError extends AppError {
  constructor(
    currentCount?: number,
    limit?: number,
    details?: Record<string, unknown>
  ) {
    super('Plan limit reached for current subscription tier.', {
      status: 403,
      code: 'PLAN_LIMIT_REACHED',
      details:
        currentCount !== undefined || limit !== undefined
          ? { currentCount, limit, ...(details ?? {}) }
          : details,
      classification: 'rate_limit',
    });
  }
}

/**
 * Error thrown when plan creation fails in the database.
 */
export class PlanCreationError extends AppError {
  constructor(details?: Record<string, unknown>) {
    super('Failed to create plan.', {
      status: 500,
      code: 'PLAN_CREATION_FAILED',
      details,
    });
  }
}
