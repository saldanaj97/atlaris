import { describe, expect, it } from 'vitest';

import { ProviderError } from '@/lib/ai/provider';
import { AttemptCapExceededError, toErrorResponse } from '@/lib/api/errors';

describe('API error redaction', () => {
  it('redacts unexpected provider errors to a generic payload', async () => {
    const providerError = new ProviderError(
      'unknown',
      'Sensitive provider failure – do not leak'
    );

    const response = toErrorResponse(providerError);
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body).toEqual({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('Sensitive provider failure');
  });

  it('preserves standardized metadata for known AppError instances', async () => {
    const response = toErrorResponse(
      new AttemptCapExceededError('attempt cap reached')
    );

    expect(response.status).toBe(429);
    const body = await response.json();

    expect(body.error).toBe('attempt cap reached');
    expect(body.code).toBe('ATTEMPTS_CAPPED');
    expect(body.classification).toBe('capped');
    expect(body).not.toHaveProperty('details');
  });
});
