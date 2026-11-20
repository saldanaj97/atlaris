import { AppError } from '@/lib/api/errors';

export class UserNotFoundError extends AppError {
  constructor(userId?: string, details?: Record<string, unknown>) {
    super('User not found', {
      status: 500,
      code: 'USER_NOT_FOUND',
      details: userId ? { userId, ...(details ?? {}) } : details,
    });
  }
}

export class UsageMetricsLockError extends AppError {
  constructor(
    userId?: string,
    month?: string,
    details?: Record<string, unknown>,
  ) {
    super('Failed to lock usage metrics', {
      status: 503,
      code: 'USAGE_METRICS_LOCK_FAILED',
      details:
        userId || month ? { userId, month, ...(details ?? {}) } : details,
    });
  }
}

export class UsageMetricsLoadError extends AppError {
  constructor(
    userId?: string,
    month?: string,
    details?: Record<string, unknown>,
  ) {
    super('Failed to load usage metrics', {
      status: 500,
      code: 'USAGE_METRICS_LOAD_FAILED',
      details:
        userId || month ? { userId, month, ...(details ?? {}) } : details,
    });
  }
}
