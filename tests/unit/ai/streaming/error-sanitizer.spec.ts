import { sanitizeSseError } from '@/lib/ai/streaming/error-sanitizer';
import { describe, expect, it } from 'vitest';

describe('SSE error sanitizer (Task 3 - Phase 2)', () => {
  it('sanitizes timeout errors', () => {
    const error = new Error('Provider timeout after 30000ms');
    const result = sanitizeSseError(error, 'timeout', {
      planId: 'plan-123',
      userId: 'user-456',
    });

    expect(result.code).toBe('GENERATION_TIMEOUT');
    expect(result.message).toBe('Plan generation timed out. Please try again.');
    expect(result.retryable).toBe(true);
    // Ensure logging-only context does not leak into client payload.
    expect(result).not.toHaveProperty('planId');
    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('loggingContext');
  });

  it('sanitizes rate limit errors', () => {
    const error = new Error('Rate limit exceeded');
    const result = sanitizeSseError(error, 'rate_limit');

    expect(result.code).toBe('RATE_LIMITED');
    expect(result.message).toBe(
      'Too many requests. Please wait a moment and try again.'
    );
    expect(result.retryable).toBe(true);
  });

  it('sanitizes provider errors', () => {
    const error = new Error('Internal OpenRouter error');
    const result = sanitizeSseError(error, 'provider_error');

    expect(result.code).toBe('GENERATION_FAILED');
    expect(result.message).toBe(
      'Plan generation encountered an error. Please try again.'
    );
    expect(result.retryable).toBe(true);
  });

  it('sanitizes validation errors', () => {
    const error = new Error('Invalid JSON in LLM output');
    const result = sanitizeSseError(error, 'validation');

    expect(result.code).toBe('INVALID_OUTPUT');
    expect(result.message).toBe(
      'Plan generation produced invalid output. Please try with different parameters.'
    );
    expect(result.retryable).toBe(false);
  });

  it('sanitizes capped errors', () => {
    const error = new Error('Attempt cap reached');
    const result = sanitizeSseError(error, 'capped');

    expect(result.code).toBe('ATTEMPTS_EXHAUSTED');
    expect(result.message).toBe(
      'Maximum generation attempts reached. Please create a new plan.'
    );
    expect(result.retryable).toBe(false);
  });

  it('handles unknown classification', () => {
    const error = new Error('Some weird error');
    const result = sanitizeSseError(error, 'unknown');

    expect(result.code).toBe('GENERATION_FAILED');
    expect(result.message).toBe(
      'An unexpected error occurred during plan generation.'
    );
    expect(result.retryable).toBe(false);
  });

  it('sanitizes non-Error objects', () => {
    const error = 'String error message with sensitive data: API_KEY=secret123';
    const result = sanitizeSseError(error, 'provider_error');

    // Verify the safe message is returned, not the raw string
    expect(result.message).not.toContain('API_KEY');
    expect(result.message).not.toContain('secret123');
    expect(result.message).toBe(
      'Plan generation encountered an error. Please try again.'
    );
  });

  it('sanitizes errors with stack traces', () => {
    const error = new Error('Database query failed');
    error.stack = 'Error: Database query failed\n  at /app/lib/db.ts:123\n...';

    const result = sanitizeSseError(error, 'provider_error');

    expect(result.message).not.toContain('/app/lib/db.ts');
    expect(result.message).not.toContain('Database query failed');
    expect(result.message).toBe(
      'Plan generation encountered an error. Please try again.'
    );
  });

  it('provides consistent output for same classification', () => {
    const error1 = new Error('First error');
    const error2 = new Error('Second completely different error');

    const result1 = sanitizeSseError(error1, 'timeout');
    const result2 = sanitizeSseError(error2, 'timeout');

    expect(result1).toEqual(result2);
    expect(result1.code).toBe('GENERATION_TIMEOUT');
  });

  it('ignores context: same classification with different context yields identical output', () => {
    const errorA = new Error('Provider timeout after 15000ms');
    const errorB = new Error('Connection timed out');
    const someContext = { planId: 'plan-abc', userId: 'user-1' };
    const differentContext = { planId: 'plan-xyz', userId: 'user-99' };

    const resultA = sanitizeSseError(errorA, 'timeout', someContext);
    const resultB = sanitizeSseError(errorB, 'timeout', differentContext);

    expect(resultA).toEqual(resultB);
    expect(resultA.code).toBe('GENERATION_TIMEOUT');
  });
});
