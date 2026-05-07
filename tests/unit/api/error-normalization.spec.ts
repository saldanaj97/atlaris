import { describe, expect, it } from 'vitest';
import {
  isAttemptErrorLike,
  toAttemptError,
} from '@/lib/api/error-normalization';

describe('isAttemptErrorLike', () => {
  it('rejects wrong field types', () => {
    expect(isAttemptErrorLike({ message: 1 })).toBe(false);
    expect(isAttemptErrorLike({ status: 'x' })).toBe(false);
  });

  it('accepts empty object', () => {
    expect(isAttemptErrorLike({})).toBe(true);
  });
});

describe('toAttemptError', () => {
  it('passes through strings', () => {
    expect(toAttemptError('oops')).toEqual({ message: 'oops' });
  });

  it('maps Error message', () => {
    expect(toAttemptError(new Error('e'))).toEqual({ message: 'e' });
  });

  it('maps attempt-like plain objects', () => {
    expect(toAttemptError({ message: 'm', status: 503 })).toEqual({
      message: 'm',
      status: 503,
    });
  });

  it('uses generic message for empty attempt-shaped objects', () => {
    expect(toAttemptError({})).toEqual({
      message: 'Unknown retry generation error',
    });
  });

  it.each([
    [42, '42'],
    [null, 'null'],
    [undefined, 'undefined'],
    [true, 'true'],
  ])('falls back to coercion for scalar %p', (value, message) => {
    expect(toAttemptError(value)).toEqual({ message });
  });

  it.each([
    [
      { status: 503 },
      { message: 'Unknown retry generation error', status: 503 },
    ],
    [{ message: 'timeout' }, { message: 'timeout' }],
    [
      { statusCode: 429 },
      { message: 'Unknown retry generation error', statusCode: 429 },
    ],
    [
      { httpStatus: 401 },
      { message: 'Unknown retry generation error', httpStatus: 401 },
    ],
  ])('preserves partial attempt-shaped objects: %p', (value, expected) => {
    expect(toAttemptError(value)).toEqual(expected);
  });
});
