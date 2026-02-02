// Domain-specific errors for usage and subscription management

import { AppError } from '@/lib/api/errors';

/**
 * Error thrown when a user cannot be found in the database.
 * This is typically an internal error as authenticated users should exist.
 */
export class UserNotFoundError extends AppError {
  constructor(userId?: string, details?: unknown) {
    super('User not found', {
      status: 500,
      code: 'USER_NOT_FOUND',
      details: userId
        ? { userId, ...(details as Record<string, unknown>) }
        : details,
    });
  }
}

/**
 * Error thrown when usage metrics cannot be locked for atomic operations.
 * This indicates a database concurrency issue or transaction failure.
 */
export class UsageMetricsLockError extends AppError {
  constructor(userId?: string, month?: string, details?: unknown) {
    super('Failed to lock usage metrics', {
      status: 503,
      code: 'USAGE_METRICS_LOCK_FAILED',
      details:
        userId || month
          ? { userId, month, ...(details as Record<string, unknown>) }
          : details,
    });
  }
}

/**
 * Error thrown when usage metrics cannot be loaded from the database.
 */
export class UsageMetricsLoadError extends AppError {
  constructor(userId?: string, month?: string, details?: unknown) {
    super('Failed to load usage metrics', {
      status: 500,
      code: 'USAGE_METRICS_LOAD_FAILED',
      details:
        userId || month
          ? { userId, month, ...(details as Record<string, unknown>) }
          : details,
    });
  }
}

/**
 * Error thrown when a user has reached their plan limit for their subscription tier.
 */
export class PlanLimitReachedError extends AppError {
  constructor(currentCount?: number, limit?: number, details?: unknown) {
    super('Plan limit reached for current subscription tier.', {
      status: 403,
      code: 'PLAN_LIMIT_REACHED',
      details:
        currentCount !== undefined || limit !== undefined
          ? { currentCount, limit, ...(details as Record<string, unknown>) }
          : details,
      classification: 'rate_limit',
    });
  }
}

/**
 * Error thrown when plan creation fails in the database.
 */
export class PlanCreationError extends AppError {
  constructor(details?: unknown) {
    super('Failed to create plan.', {
      status: 500,
      code: 'PLAN_CREATION_FAILED',
      details,
    });
  }
}
