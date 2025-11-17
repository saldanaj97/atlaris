import { describe, expect, it } from 'vitest';
import {
  json,
  jsonError,
  notImplemented,
  methodNotAllowed,
  assert,
} from '@/lib/api/response';
import { AppError } from '@/lib/api/errors';

describe('json', () => {
  it('should create JSON response with default status 200', async () => {
    const data = { id: 1, name: 'Test' };
    const response = json(data);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(data);
  });

  it('should create JSON response with custom status', async () => {
    const data = { message: 'Created' };
    const response = json(data, { status: 201 });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual(data);
  });

  it('should create JSON response with custom headers', async () => {
    const data = { data: 'test' };
    const response = json(data, {
      headers: { 'X-Custom-Header': 'value' },
    });

    expect(response.headers.get('X-Custom-Header')).toBe('value');
  });

  it('should create JSON response with both status and headers', async () => {
    const data = { result: 'ok' };
    const response = json(data, {
      status: 202,
      headers: { 'X-Request-Id': '123' },
    });

    expect(response.status).toBe(202);
    expect(response.headers.get('X-Request-Id')).toBe('123');
    const body = await response.json();
    expect(body).toEqual(data);
  });
});

describe('jsonError', () => {
  it('should create simple error response with default status 400', async () => {
    const response = jsonError('Validation failed');

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: 'Validation failed' });
  });

  it('should create error response with custom status', async () => {
    const response = jsonError('Not found', { status: 404 });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ error: 'Not found' });
  });

  it('should create structured error with code', async () => {
    const response = jsonError('Invalid input', {
      status: 422,
      code: 'INVALID_INPUT',
    });

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        message: 'Invalid input',
        code: 'INVALID_INPUT',
      },
    });
  });

  it('should create structured error with classification', async () => {
    const response = jsonError('Rate limited', {
      status: 429,
      classification: 'rate_limit',
    });

    const body = await response.json();
    expect(body).toEqual({
      error: {
        message: 'Rate limited',
        classification: 'rate_limit',
      },
    });
  });

  it('should create structured error with details', async () => {
    const response = jsonError('Validation failed', {
      status: 400,
      code: 'VALIDATION_ERROR',
      details: { field: 'email', reason: 'invalid format' },
    });

    const body = await response.json();
    expect(body).toEqual({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: { field: 'email', reason: 'invalid format' },
      },
    });
  });

  it('should create structured error with all fields', async () => {
    const response = jsonError('Request failed', {
      status: 403,
      code: 'FORBIDDEN',
      classification: 'provider_error',
      details: { reason: 'insufficient permissions' },
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        message: 'Request failed',
        code: 'FORBIDDEN',
        classification: 'provider_error',
        details: { reason: 'insufficient permissions' },
      },
    });
  });

  it('should include custom headers', async () => {
    const response = jsonError('Error', {
      headers: { 'X-Error-Id': 'err-123' },
    });

    expect(response.headers.get('X-Error-Id')).toBe('err-123');
  });

  it('should use simple format when no structured fields provided', async () => {
    const response = jsonError('Simple error');

    const body = await response.json();
    expect(body).toEqual({ error: 'Simple error' });
  });

  it('should handle details with value 0 or false', async () => {
    const response = jsonError('Error', {
      code: 'ERROR',
      details: { count: 0, enabled: false },
    });

    const body = await response.json();
    expect(body.error.details).toEqual({ count: 0, enabled: false });
  });
});

describe('notImplemented', () => {
  it('should return 501 status', async () => {
    const response = notImplemented();
    expect(response.status).toBe(501);
  });

  it('should return correct error message and code', async () => {
    const response = notImplemented();
    const body = await response.json();

    expect(body).toEqual({
      error: {
        message: 'Not Implemented',
        code: 'NOT_IMPLEMENTED',
      },
    });
  });
});

describe('methodNotAllowed', () => {
  it('should return 405 status', async () => {
    const response = methodNotAllowed();
    expect(response.status).toBe(405);
  });

  it('should return correct error message and code', async () => {
    const response = methodNotAllowed();
    const body = await response.json();

    expect(body).toEqual({
      error: {
        message: 'Method Not Allowed',
        code: 'METHOD_NOT_ALLOWED',
      },
    });
  });
});

describe('assert', () => {
  it('should not throw when condition is true', () => {
    const error = new AppError('Test error');
    expect(() => assert(true, error)).not.toThrow();
    expect(() => assert(1, error)).not.toThrow();
    expect(() => assert('value', error)).not.toThrow();
    expect(() => assert({}, error)).not.toThrow();
  });

  it('should throw the provided error when condition is false', () => {
    const error = new AppError('Test error', { status: 400 });
    expect(() => assert(false, error)).toThrow(error);
  });

  it('should throw when condition is null', () => {
    const error = new AppError('Null value');
    expect(() => assert(null, error)).toThrow(error);
  });

  it('should throw when condition is undefined', () => {
    const error = new AppError('Undefined value');
    expect(() => assert(undefined, error)).toThrow(error);
  });

  it('should throw when condition is 0', () => {
    const error = new AppError('Zero value');
    expect(() => assert(0, error)).toThrow(error);
  });

  it('should throw when condition is empty string', () => {
    const error = new AppError('Empty string');
    expect(() => assert('', error)).toThrow(error);
  });

  it('should preserve error properties', () => {
    const error = new AppError('Custom error', {
      status: 403,
      code: 'FORBIDDEN',
      details: { userId: '123' },
    });

    try {
      assert(false, error);
      // Should not reach here
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBe(error);
      expect((err as AppError).status()).toBe(403);
      expect((err as AppError).code()).toBe('FORBIDDEN');
      expect((err as AppError).details()).toEqual({ userId: '123' });
    }
  });
});
