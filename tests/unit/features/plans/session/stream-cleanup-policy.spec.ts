import { describe, expect, it } from 'vitest';

import { AppError } from '@/lib/api/errors';
import {
  DEFAULT_PROVIDER_FAILURE_CLASSIFICATION,
  classifyUnhandledGenerationError,
} from '@/features/plans/session/stream-cleanup-policy';

describe('classifyUnhandledGenerationError', () => {
  it('uses AppError classification when present', () => {
    const err = new AppError('nope', { classification: 'validation' });
    expect(classifyUnhandledGenerationError(err)).toBe('validation');
  });

  it('falls back to provider_error when AppError omits classification', () => {
    const err = new AppError('nope');
    expect(classifyUnhandledGenerationError(err)).toBe(
      DEFAULT_PROVIDER_FAILURE_CLASSIFICATION,
    );
  });

  it('classifies AbortError as timeout', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(classifyUnhandledGenerationError(err)).toBe('timeout');
  });

  it('classifies TimeoutError as timeout', () => {
    const err = new Error('timed out');
    err.name = 'TimeoutError';
    expect(classifyUnhandledGenerationError(err)).toBe('timeout');
  });

  it('defaults unknown errors to provider_error', () => {
    expect(classifyUnhandledGenerationError('boom')).toBe(
      DEFAULT_PROVIDER_FAILURE_CLASSIFICATION,
    );
  });
});
