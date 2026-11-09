import { classifyUnhandledGenerationError } from '@/features/plans/session/stream-cleanup-policy';
import { AppError } from '@/lib/api/errors';
import { ReservationPlanNotFoundError } from '@/lib/db/queries/attempts';
import { describe, expect, it } from 'vitest';

describe('classifyUnhandledGenerationError', () => {
  it('uses AppError classification when present', () => {
    const err = new AppError('nope', { classification: 'validation' });
    expect(classifyUnhandledGenerationError(err)).toBe('validation');
  });

  it('falls back to unknown when AppError omits classification', () => {
    const err = new AppError('nope');
    expect(classifyUnhandledGenerationError(err)).toBe('unknown');
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

  it('classifies a plan missing at reservation as unknown, not provider_error', () => {
    const err = new ReservationPlanNotFoundError('plan-1');
    expect(classifyUnhandledGenerationError(err)).toBe('unknown');
  });

  it('defaults unrecognized errors to unknown', () => {
    expect(classifyUnhandledGenerationError(new Error('boom'))).toBe('unknown');
    expect(classifyUnhandledGenerationError('boom')).toBe('unknown');
  });
});
