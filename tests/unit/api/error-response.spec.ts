import { describe, expect, it } from 'vitest';

import {
  buildApiErrorResponse,
  getDefaultErrorCode,
  normalizeApiErrorResponse,
  parseApiErrorResponse,
  toApiErrorJsonResponse,
} from '@/lib/api/error-response';

describe('error-response', () => {
  describe('getDefaultErrorCode', () => {
    it('returns mapped code for known statuses', () => {
      expect(getDefaultErrorCode(400)).toBe('BAD_REQUEST');
      expect(getDefaultErrorCode(404)).toBe('NOT_FOUND');
      expect(getDefaultErrorCode(429)).toBe('RATE_LIMITED');
      expect(getDefaultErrorCode(500)).toBe('INTERNAL_ERROR');
    });

    it('returns generic fallback for unknown statuses', () => {
      expect(getDefaultErrorCode(418)).toBe('ERROR');
    });
  });

  describe('normalizeApiErrorResponse', () => {
    it('normalizes canonical error response shape', () => {
      const result = normalizeApiErrorResponse(
        {
          error: 'Quota exceeded',
          code: 'FEATURE_LIMIT_EXCEEDED',
          classification: 'rate_limit',
          details: { feature: 'plan' },
          retryAfter: 60,
        },
        { status: 429, fallbackMessage: 'Fallback' }
      );

      expect(result).toEqual({
        error: 'Quota exceeded',
        code: 'FEATURE_LIMIT_EXCEEDED',
        classification: 'rate_limit',
        details: { feature: 'plan' },
        retryAfter: 60,
      });
    });

    it('normalizes legacy nested error shape', () => {
      const result = normalizeApiErrorResponse(
        {
          error: {
            message: 'Legacy format',
            code: 'LEGACY_CODE',
            classification: 'validation',
            details: { field: 'email' },
          },
        },
        { status: 400, fallbackMessage: 'Fallback' }
      );

      expect(result).toEqual({
        error: 'Legacy format',
        code: 'LEGACY_CODE',
        classification: 'validation',
        details: { field: 'email' },
      });
    });

    it('accepts conflict as a valid classification', () => {
      const result = normalizeApiErrorResponse(
        {
          error: 'Generation already in progress',
          code: 'CONFLICT',
          classification: 'conflict',
        },
        { status: 409, fallbackMessage: 'Fallback' }
      );

      expect(result).toEqual({
        error: 'Generation already in progress',
        code: 'CONFLICT',
        classification: 'conflict',
      });
    });

    it('falls back when payload is not parseable', () => {
      const result = normalizeApiErrorResponse('not-an-object', {
        status: 404,
        fallbackMessage: 'Unable to load resource.',
      });

      expect(result).toEqual({
        error: 'Unable to load resource.',
        code: 'NOT_FOUND',
      });
    });
  });

  describe('buildApiErrorResponse', () => {
    it('builds default payload with fallback code', () => {
      const payload = buildApiErrorResponse('Something went wrong');

      expect(payload).toEqual({
        error: 'Something went wrong',
        code: 'BAD_REQUEST',
      });
    });

    it('includes optional fields when provided', () => {
      const payload = buildApiErrorResponse('Rate limit exceeded', {
        status: 429,
        code: 'RATE_LIMITED',
        classification: 'rate_limit',
        details: { scope: 'aiGeneration' },
        retryAfter: 30,
      });

      expect(payload).toEqual({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMITED',
        classification: 'rate_limit',
        details: { scope: 'aiGeneration' },
        retryAfter: 30,
      });
    });
  });

  describe('toApiErrorJsonResponse', () => {
    it('returns response with requested status and error body', async () => {
      const response = toApiErrorJsonResponse('Not found', { status: 404 });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: 'Not found',
        code: 'NOT_FOUND',
      });
    });

    it('preserves provided headers', () => {
      const response = toApiErrorJsonResponse('Bad request', {
        status: 400,
        headers: { 'X-Custom': 'value' },
      });

      expect(response.headers.get('X-Custom')).toBe('value');
    });
  });

  describe('parseApiErrorResponse', () => {
    it('parses json response body', async () => {
      const response = new Response(
        JSON.stringify({ error: 'Plan not found', code: 'NOT_FOUND' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const result = await parseApiErrorResponse(response, 'Fallback');

      expect(result).toEqual({
        error: 'Plan not found',
        code: 'NOT_FOUND',
      });
    });

    it('returns fallback when response body is not json', async () => {
      const response = new Response('not-json', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });

      const result = await parseApiErrorResponse(
        response,
        'Unable to process request.'
      );

      expect(result).toEqual({
        error: 'Unable to process request.',
        code: 'INTERNAL_ERROR',
      });
    });
  });
});
