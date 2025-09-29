// Centralized error types and helpers for API layer

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
    super(message, { status: 400, code: 'VALIDATION_ERROR', details });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super(message, { status: 409, code: 'CONFLICT', details });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too Many Requests', details?: unknown) {
    super(message, {
      status: 429,
      code: 'RATE_LIMITED',
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
      code: 'ATTEMPTS_CAPPED',
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
    { error: 'Internal Server Error', code: 'INTERNAL_ERROR' },
    { status: 500 }
  );
}
