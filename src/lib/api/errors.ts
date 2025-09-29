// Centralized error types and helpers for API layer

import type { FailureClassification } from '@/lib/types/client';

/**
 * Standardized error codes for consistent error handling
 */
export const ErrorCodes = {
  // Validation errors (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',

  // Authentication errors (401)
  UNAUTHORIZED: 'UNAUTHORIZED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',

  // Authorization errors (403)
  FORBIDDEN: 'FORBIDDEN',
  PLAN_LIMIT_REACHED: 'PLAN_LIMIT_REACHED',

  // Not found (404)
  NOT_FOUND: 'NOT_FOUND',
  PLAN_NOT_FOUND: 'PLAN_NOT_FOUND',

  // Conflict errors (409)
  CONFLICT: 'CONFLICT',

  // Rate limit errors (429)
  RATE_LIMITED: 'RATE_LIMITED',
  ATTEMPTS_CAPPED: 'ATTEMPTS_CAPPED',

  // Generation errors (500)
  GENERATION_FAILED: 'GENERATION_FAILED',
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
  AI_TIMEOUT: 'AI_TIMEOUT',
  AI_RATE_LIMIT: 'AI_RATE_LIMIT',

  // Database errors (500)
  DATABASE_ERROR: 'DATABASE_ERROR',

  // Generic
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class AppError extends Error {
  public readonly timestamp: string;

  constructor(
    message: string,
    public options: {
      status?: number;
      code?: string;
      details?: unknown;
      classification?: FailureClassification;
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
  status() {
    return this.options.status ?? 500;
  }
  code() {
    return this.options.code ?? ErrorCodes.INTERNAL_ERROR;
  }
  details() {
    return this.options.details;
  }
  classification() {
    return this.options.classification;
  }
}

export class AuthError extends AppError {
  constructor(message = 'Unauthorized', details?: unknown) {
    super(message, { status: 401, code: ErrorCodes.UNAUTHORIZED, details });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: unknown) {
    super(message, { status: 403, code: ErrorCodes.FORBIDDEN, details });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not Found', details?: unknown) {
    super(message, { status: 404, code: ErrorCodes.NOT_FOUND, details });
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation Failed', details?: unknown) {
    super(message, { status: 400, code: ErrorCodes.VALIDATION_ERROR, details });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super(message, { status: 409, code: ErrorCodes.CONFLICT, details });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too Many Requests', details?: unknown) {
    super(message, {
      status: 429,
      code: ErrorCodes.RATE_LIMITED,
      details,
      classification: 'rate_limit',
    });
  }
}

export class AttemptCapExceededError extends AppError {
  constructor(
    message = 'Maximum generation attempts exceeded',
    details?: unknown
  ) {
    super(message, {
      status: 429,
      code: ErrorCodes.ATTEMPTS_CAPPED,
      details,
      classification: 'capped',
    });
  }
}

export function toErrorResponse(err: unknown) {
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      error: err.message,
      code: err.code(),
      timestamp: err.timestamp,
    };

    const classification = err.classification();
    if (classification) {
      body.classification = classification;
    }

    const details = err.details();
    if (details !== undefined) {
      body.details = details;
    }

    return Response.json(body, { status: err.status() });
  }
  console.error('Unexpected error', err);
  return Response.json(
    {
      error: 'Internal Server Error',
      code: ErrorCodes.INTERNAL_ERROR,
      timestamp: new Date().toISOString(),
    },
    { status: 500 }
  );
}

/**
 * Helper factory functions for common error types
 */

/**
 * Create a validation error (400)
 */
export function createValidationError(
  message: string,
  details?: Record<string, unknown>
): ValidationError {
  return new ValidationError(message, details);
}

/**
 * Create a not found error (404)
 */
export function createNotFoundError(resource: string): NotFoundError {
  return new NotFoundError(`${resource} not found`);
}

/**
 * Create a generation error (500)
 */
export function createGenerationError(
  message: string,
  details?: Record<string, unknown>
): AppError {
  return new AppError(message, {
    status: 500,
    code: ErrorCodes.GENERATION_FAILED,
    details,
  });
}
