import { json, jsonError } from '@/lib/api/response';
import { describe, expect, it } from 'vitest';

describe('json', () => {
  it('should create JSON response with default status 200', async () => {
    const data = { id: 1, name: 'Test' };
    const response = json(data);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(data);
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
    expect(body).toEqual({
      error: 'Validation failed',
      code: 'BAD_REQUEST',
    });
  });

  it('should create structured error with code', async () => {
    const response = jsonError('Invalid input', {
      status: 422,
      code: 'INVALID_INPUT',
    });

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body).toEqual({
      error: 'Invalid input',
      code: 'INVALID_INPUT',
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
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: { field: 'email', reason: 'invalid format' },
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
      error: 'Request failed',
      code: 'FORBIDDEN',
      classification: 'provider_error',
      details: { reason: 'insufficient permissions' },
    });
  });

  it('should handle details with value 0 or false', async () => {
    const response = jsonError('Error', {
      code: 'ERROR',
      details: { count: 0, enabled: false },
    });

    const body = await response.json();
    expect(body.details).toEqual({ count: 0, enabled: false });
  });
});
