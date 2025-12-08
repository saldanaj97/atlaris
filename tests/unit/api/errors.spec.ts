import {
  AppError,
  AttemptCapExceededError,
  AuthError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  toErrorResponse,
  ValidationError,
} from '@/lib/api/errors';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('AppError', () => {
  it('should create error with message', () => {
    const error = new AppError('Test error');

    expect(error.message).toBe('Test error');
    expect(error.name).toBe('AppError');
  });

  it('should default status to 500', () => {
    const error = new AppError('Test error');
    expect(error.status()).toBe(500);
  });

  it('should use custom status', () => {
    const error = new AppError('Test error', { status: 400 });
    expect(error.status()).toBe(400);
  });

  it('should default code to INTERNAL_ERROR', () => {
    const error = new AppError('Test error');
    expect(error.code()).toBe('INTERNAL_ERROR');
  });

  it('should use custom code', () => {
    const error = new AppError('Test error', { code: 'CUSTOM_CODE' });
    expect(error.code()).toBe('CUSTOM_CODE');
  });

  it('should store details', () => {
    const details = { field: 'email', reason: 'invalid' };
    const error = new AppError('Test error', { details });
    expect(error.details()).toEqual(details);
  });

  it('should return undefined for missing details', () => {
    const error = new AppError('Test error');
    expect(error.details()).toBeUndefined();
  });

  it('should store classification', () => {
    const error = new AppError('Test error', { classification: 'timeout' });
    expect(error.classification()).toBe('timeout');
  });

  it('should return undefined for missing classification', () => {
    const error = new AppError('Test error');
    expect(error.classification()).toBeUndefined();
  });
});

describe('AuthError', () => {
  it('should create 401 error with default message', () => {
    const error = new AuthError();

    expect(error.message).toBe('Unauthorized');
    expect(error.status()).toBe(401);
    expect(error.code()).toBe('UNAUTHORIZED');
  });

  it('should use custom message', () => {
    const error = new AuthError('Invalid token');

    expect(error.message).toBe('Invalid token');
    expect(error.status()).toBe(401);
  });

  it('should include details', () => {
    const details = { reason: 'expired' };
    const error = new AuthError('Token expired', details);

    expect(error.details()).toEqual(details);
  });
});

describe('ForbiddenError', () => {
  it('should create 403 error with default message', () => {
    const error = new ForbiddenError();

    expect(error.message).toBe('Forbidden');
    expect(error.status()).toBe(403);
    expect(error.code()).toBe('FORBIDDEN');
  });

  it('should use custom message', () => {
    const error = new ForbiddenError('Insufficient permissions');

    expect(error.message).toBe('Insufficient permissions');
    expect(error.status()).toBe(403);
  });

  it('should include details', () => {
    const details = { requiredRole: 'admin' };
    const error = new ForbiddenError('Access denied', details);

    expect(error.details()).toEqual(details);
  });
});

describe('NotFoundError', () => {
  it('should create 404 error with default message', () => {
    const error = new NotFoundError();

    expect(error.message).toBe('Not Found');
    expect(error.status()).toBe(404);
    expect(error.code()).toBe('NOT_FOUND');
  });

  it('should use custom message', () => {
    const error = new NotFoundError('Resource not found');

    expect(error.message).toBe('Resource not found');
    expect(error.status()).toBe(404);
  });

  it('should include details', () => {
    const details = { id: '123', type: 'plan' };
    const error = new NotFoundError('Plan not found', details);

    expect(error.details()).toEqual(details);
  });
});

describe('ValidationError', () => {
  it('should create 400 error with default message', () => {
    const error = new ValidationError();

    expect(error.message).toBe('Validation Failed');
    expect(error.status()).toBe(400);
    expect(error.code()).toBe('VALIDATION_ERROR');
  });

  it('should use custom message', () => {
    const error = new ValidationError('Invalid input');

    expect(error.message).toBe('Invalid input');
    expect(error.status()).toBe(400);
  });

  it('should include details', () => {
    const details = { fields: ['email', 'password'] };
    const error = new ValidationError('Multiple fields invalid', details);

    expect(error.details()).toEqual(details);
  });
});

describe('ConflictError', () => {
  it('should create 409 error with default message', () => {
    const error = new ConflictError();

    expect(error.message).toBe('Conflict');
    expect(error.status()).toBe(409);
    expect(error.code()).toBe('CONFLICT');
  });

  it('should use custom message', () => {
    const error = new ConflictError('Resource already exists');

    expect(error.message).toBe('Resource already exists');
    expect(error.status()).toBe(409);
  });

  it('should include details', () => {
    const details = { field: 'email', value: 'test@example.com' };
    const error = new ConflictError('Email already in use', details);

    expect(error.details()).toEqual(details);
  });
});

describe('RateLimitError', () => {
  it('should create 429 error with default message', () => {
    const error = new RateLimitError();

    expect(error.message).toBe('Too Many Requests');
    expect(error.status()).toBe(429);
    expect(error.code()).toBe('RATE_LIMITED');
    expect(error.classification()).toBe('rate_limit');
  });

  it('should use custom message', () => {
    const error = new RateLimitError('Rate limit exceeded');

    expect(error.message).toBe('Rate limit exceeded');
    expect(error.status()).toBe(429);
  });

  it('should store retryAfter from details', () => {
    const error = new RateLimitError('Rate limited', { retryAfter: 60 });

    expect(error.retryAfter).toBe(60);
    expect(error.details()).toEqual({ retryAfter: 60 });
  });

  it('should handle missing retryAfter', () => {
    const error = new RateLimitError();

    expect(error.retryAfter).toBeUndefined();
  });
});

describe('AttemptCapExceededError', () => {
  it('should create 429 error with default message', () => {
    const error = new AttemptCapExceededError();

    expect(error.message).toBe('Maximum generation attempts exceeded');
    expect(error.status()).toBe(429);
    expect(error.code()).toBe('ATTEMPTS_CAPPED');
    expect(error.classification()).toBe('capped');
  });

  it('should use custom message', () => {
    const error = new AttemptCapExceededError('Too many attempts');

    expect(error.message).toBe('Too many attempts');
    expect(error.status()).toBe(429);
  });

  it('should include details', () => {
    const details = { count: 5, limit: 3 };
    const error = new AttemptCapExceededError('Attempts exceeded', details);

    expect(error.details()).toEqual(details);
  });
});

describe('toErrorResponse', () => {
  // Mock logger to prevent console output during tests
  beforeEach(() => {
    vi.mock('@/lib/logging/logger', () => ({
      logger: {
        error: vi.fn(),
      },
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should convert AppError to response', async () => {
    const error = new AppError('Test error', {
      status: 400,
      code: 'TEST_ERROR',
    });
    const response = toErrorResponse(error);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({
      error: 'Test error',
      code: 'TEST_ERROR',
    });
  });

  it('should include classification when present', async () => {
    const error = new AppError('Timeout', {
      status: 500,
      code: 'TIMEOUT',
      classification: 'timeout',
    });
    const response = toErrorResponse(error);

    const body = await response.json();
    expect(body.classification).toBe('timeout');
  });

  it('should include details when present', async () => {
    const details = { field: 'email', reason: 'invalid format' };
    const error = new AppError('Validation error', {
      status: 400,
      code: 'VALIDATION_ERROR',
      details,
    });
    const response = toErrorResponse(error);

    const body = await response.json();
    expect(body.details).toEqual(details);
  });

  it('should include retryAfter for RateLimitError', async () => {
    const error = new RateLimitError('Rate limited', { retryAfter: 120 });
    const response = toErrorResponse(error);

    const body = await response.json();
    expect(body.retryAfter).toBe(120);
  });

  it('should handle AuthError', async () => {
    const error = new AuthError('Invalid token');
    const response = toErrorResponse(error);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({
      error: 'Invalid token',
      code: 'UNAUTHORIZED',
    });
  });

  it('should handle ForbiddenError', async () => {
    const error = new ForbiddenError('Access denied');
    const response = toErrorResponse(error);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual({
      error: 'Access denied',
      code: 'FORBIDDEN',
    });
  });

  it('should handle NotFoundError', async () => {
    const error = new NotFoundError('Resource not found');
    const response = toErrorResponse(error);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({
      error: 'Resource not found',
      code: 'NOT_FOUND',
    });
  });

  it('should handle ValidationError', async () => {
    const error = new ValidationError('Invalid input');
    const response = toErrorResponse(error);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({
      error: 'Invalid input',
      code: 'VALIDATION_ERROR',
      classification: 'validation',
    });
  });

  it('should handle ConflictError', async () => {
    const error = new ConflictError('Already exists');
    const response = toErrorResponse(error);

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toEqual({
      error: 'Already exists',
      code: 'CONFLICT',
    });
  });

  it('should return 500 for unexpected errors', async () => {
    const error = new Error('Unexpected error');
    const response = toErrorResponse(error);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
    });
  });

  it('should return 500 for non-error objects', async () => {
    const response = toErrorResponse('string error');

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
    });
  });

  it('should return 500 for null', async () => {
    const response = toErrorResponse(null);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
    });
  });

  it('should not include classification when null', async () => {
    const error = new AppError('Test', {
      status: 400,
      code: 'TEST',
      classification: undefined,
    });
    const response = toErrorResponse(error);

    const body = await response.json();
    expect(body).not.toHaveProperty('classification');
  });

  it('should not include details when undefined', async () => {
    const error = new AppError('Test', {
      status: 400,
      code: 'TEST',
      details: undefined,
    });
    const response = toErrorResponse(error);

    const body = await response.json();
    expect(body).not.toHaveProperty('details');
  });
});
