// Centralized error types and helpers for API layer

import { jsonError } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';
import type { FailureClassification } from '@/lib/types/client';

function hasStringCode(value: unknown): value is { code: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const maybeRecord = value as Record<string, unknown>;
  return typeof maybeRecord.code === 'string';
}

export class AppError extends Error {
  constructor(
    message: string,
    public options: {
      status?: number;
      code?: string;
      details?: unknown;
      classification?: FailureClassification;
      headers?: Record<string, string>;
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
  }

  status(): number {
    return this.options.status ?? 500;
  }

  code(): string {
    return this.options.code ?? 'INTERNAL_ERROR';
  }

  details(): unknown {
    return this.options.details;
  }

  classification(): FailureClassification | undefined {
    return this.options.classification;
  }

  headers(): Record<string, string> {
    return this.options.headers ?? {};
  }
}

export class AuthError extends AppError {
  constructor(message = 'Unauthorized', details?: unknown) {
    super(message, { status: 401, code: 'UNAUTHORIZED', details });
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

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable', details?: unknown) {
    super(message, { status: 503, code: 'SERVICE_UNAVAILABLE', details });
  }
}

export interface RateLimitErrorDetails {
  retryAfter?: number;
  remaining?: number;
  limit?: number;
  reset?: number;
}

interface RateLimitErrorOptions {
  headers?: Record<string, string>;
}

export class RateLimitError extends AppError {
  public retryAfter?: number;
  public remaining?: number;
  public limit?: number;
  public reset?: number;

  constructor(
    message = 'Too Many Requests',
    details?: RateLimitErrorDetails,
    options?: RateLimitErrorOptions
  ) {
    super(message, {
      status: 429,
      code: 'RATE_LIMITED',
      details,
      classification: 'rate_limit',
      headers: options?.headers,
    });
    this.retryAfter = details?.retryAfter;
    this.remaining = details?.remaining;
    this.limit = details?.limit;
    this.reset = details?.reset;
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
 * Extracts a string `code` property from an unknown thrown value (e.g. Stripe errors).
 * Returns `undefined` when the value has no string `code` field.
 */
export function extractErrorCode(error: unknown): string | undefined {
  if (hasStringCode(error)) {
    return error.code;
  }
  return undefined;
}

/**
 * Strips absolute file paths from stack traces to prevent internal
 * directory structure disclosure in log aggregators.
 * Preserves the function name and relative path for debuggability.
 */
function redactStackTrace(stack: string | undefined): string | undefined {
  if (!stack) {
    return undefined;
  }

  // Normalize separators first so Windows and POSIX stacks are handled equally.
  const normalizedStack = stack.replace(/\\/g, '/');

  // Strip absolute prefixes while keeping relative app/build paths.
  return normalizedStack.replace(
    /(?:[A-Za-z]:)?(?:\/\/[^/\s:()]+)?(?:\/[^/\s:()]+)*\/((?:src|node_modules|\.next|dist)\/[^\s:()]+)/g,
    '$1'
  );
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
      stack: redactStackTrace(err.stack),
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

export function toErrorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    const headers: Record<string, string> = { ...err.headers() };
    let retryAfter: number | undefined;

    if (err instanceof RateLimitError) {
      if (err.retryAfter !== undefined) {
        retryAfter = err.retryAfter;
        headers['Retry-After'] = String(err.retryAfter);
      }
      if (err.limit !== undefined) {
        headers['X-RateLimit-Limit'] = String(err.limit);
      }
      if (err.remaining !== undefined) {
        headers['X-RateLimit-Remaining'] = String(Math.max(0, err.remaining));
      }
      if (err.reset !== undefined) {
        headers['X-RateLimit-Reset'] = String(err.reset);
      }
    }

    return jsonError(err.message, {
      status: err.status(),
      code: err.code(),
      classification: err.classification(),
      details: err.details(),
      retryAfter,
      headers,
    });
  }
  logger.error({ error: toSafeError(err) }, 'Unexpected API error');
  return jsonError('Internal Server Error', {
    status: 500,
    code: 'INTERNAL_ERROR',
  });
}
