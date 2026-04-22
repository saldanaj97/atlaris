// Domain-specific errors for usage and subscription management

import { AppError } from '@/lib/api/errors';

/**
 * Error thrown when a user cannot be found in the database.
 * This is typically an internal error as authenticated users should exist.
 */
export class UserNotFoundError extends AppError {
	constructor(userId?: string, details?: Record<string, unknown>) {
		super('User not found', {
			status: 500,
			code: 'USER_NOT_FOUND',
			details: userId ? { userId, ...(details ?? {}) } : details,
		});
	}
}

/**
 * Error thrown when usage metrics cannot be locked for atomic operations.
 * This indicates a database concurrency issue or transaction failure.
 */
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

/**
 * Error thrown when usage metrics cannot be loaded from the database.
 */
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
