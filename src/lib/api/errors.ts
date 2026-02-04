// Centralized error types and helpers for API layer

import { logger } from '@/lib/logging/logger';
import type { FailureClassification } from '@/lib/types/client';

export class AppError extends Error {
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
  }

  status() {
    return this.options.status ?? 500;
  }

  code() {
    return this.options.code ?? 'INTERNAL_ERROR';
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
    super(message, { status: 401, code: 'UNAUTHORIZED', details });
  }
}

export class JwtValidationError extends AppError {
  constructor(message = 'Authentication failed', details?: unknown) {
    super(message, { status: 401, code: 'JWT_VALIDATION_FAILED', details });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: unknown) {
    super(message, { status: 403, code: 'FORBIDDEN', details });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not Found', details?: unknown) {
    super(message, { status: 404, code: 'NOT_FOUND', details });
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation Failed', details?: unknown) {
    super(message, {
      status: 400,
      code: 'VALIDATION_ERROR',
      details,
      classification: 'validation',
    });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super(message, { status: 409, code: 'CONFLICT', details });
  }
}

export class RateLimitError extends AppError {
  public retryAfter?: number;

  constructor(
    message = 'Too Many Requests',
    details?: { retryAfter?: number }
  ) {
    super(message, {
      status: 429,
      code: 'RATE_LIMITED',
      details,
      classification: 'rate_limit',
    });
    this.retryAfter = details?.retryAfter;
  }
}

export class AttemptCapExceededError extends AppError {
  constructor(
    message = 'Maximum generation attempts exceeded',
    details?: unknown
  ) {
    super(message, {
      status: 429,
      code: 'ATTEMPTS_CAPPED',
      details,
      classification: 'capped',
    });
  }
}

export class IntegrationSyncError extends AppError {
  constructor(message = 'Google Calendar sync failed', details?: unknown) {
    super(message, {
      status: 500,
      code: 'GOOGLE_CALENDAR_SYNC_FAILED',
      details,
    });
  }
}

export class ExportQuotaExceededError extends AppError {
  constructor(message = 'Export quota exceeded', details?: unknown) {
    super(message, {
      status: 403,
      code: 'EXPORT_QUOTA_EXCEEDED',
      details,
      classification: 'rate_limit',
    });
  }
}

/**
 * Internal utility function to serialize errors into a safe, loggable format.
 * Used for error logging when unexpected errors occur outside of AppError handling.
 * Not exported as it's only intended for internal use within this module.
 */
function toSafeError(err: unknown): Record<string, unknown> {
  if (err instanceof AppError) {
    return {
      name: err.name,
      message: err.message,
      status: err.status(),
      code: err.code(),
    };
  }

  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }

  if (typeof err === 'object' && err !== null) {
    return {
      message: 'Unknown error object',
      type: err.constructor?.name ?? 'Object',
    };
  }

  return {
    message: String(err),
  };
}

export function toErrorResponse(err: unknown) {
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      error: err.message,
      code: err.code(),
    };

    const classification = err.classification();
    if (classification) {
      body.classification = classification;
    }

    const details = err.details();
    if (details !== undefined) {
      body.details = details;
    }

    // Add retryAfter for RateLimitError
    if (err instanceof RateLimitError && err.retryAfter !== undefined) {
      body.retryAfter = err.retryAfter;
    }

    return Response.json(body, { status: err.status() });
  }
  logger.error({ error: toSafeError(err) }, 'Unexpected API error');
  return Response.json(
    { error: 'Internal Server Error', code: 'INTERNAL_ERROR' },
    { status: 500 }
  );
}
