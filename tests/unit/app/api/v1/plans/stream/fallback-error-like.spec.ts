import { describe, expect, it } from 'vitest';
import { toFallbackErrorLike } from '@/features/plans/session/stream-cleanup';

describe('toFallbackErrorLike', () => {
  it('maps Error instances', () => {
    const err = new Error('fail');
    err.name = 'CustomErr';
    const like = toFallbackErrorLike(err);
    expect(like.name).toBe('CustomErr');
    expect(like.message).toBe('fail');
    expect(like.stack).toEqual(expect.stringContaining('fail'));
  });

  it('uses safe JSON for objects without message', () => {
    const like = toFallbackErrorLike({ code: 'x' });
    expect(like.name).toBe('UnknownGenerationError');
    expect(like.message).toBe('{"code":"x"}');
    expect(like.stack).toBeUndefined();
  });

  it('uses string messages from plain objects without inventing a stack', () => {
    const like = toFallbackErrorLike({ message: 'plain failure', cause: null });
    expect(like.name).toBe('UnknownGenerationError');
    expect(like.message).toBe('plain failure');
    expect(like.stack).toBeUndefined();
    expect(like.cause).toBeNull();
  });

  it.each([
    [503, '503'],
    [null, 'null'],
    [undefined, 'undefined'],
  ])('maps %p to a string message', (input, expected) => {
    const like = toFallbackErrorLike(input);
    expect(like.name).toBe('UnknownGenerationError');
    expect(like.message).toBe(expected);
    expect(like.stack).toBeUndefined();
  });

  it('uses safe JSON for empty objects', () => {
    const like = toFallbackErrorLike({});
    expect(like.name).toBe('UnknownGenerationError');
    expect(like.message).toBe('{}');
    expect(like.stack).toBeUndefined();
  });

  it('includes circular-safe serialization', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const like = toFallbackErrorLike(obj);
    expect(like.message).toBe('{"a":1,"self":"[Circular]"}');
  });

  it('copies numeric status and statusCode from plain objects', () => {
    const like = toFallbackErrorLike({
      message: 'x',
      status: 503,
      statusCode: 503,
    });
    expect(like.status).toBe(503);
    expect(like.statusCode).toBe(503);
  });

  it('maps response null and response body status for SSE-shaped errors', () => {
    const withNull = toFallbackErrorLike({
      message: 'n',
      response: null,
    });
    expect(withNull.response).toBeNull();

    const withBody = toFallbackErrorLike({
      message: 'b',
      response: { status: 418 },
    });
    expect(withBody.response).toEqual({ status: 418 });

    const withBodyNoStatus = toFallbackErrorLike({
      message: 'c',
      response: { headers: {} },
    });
    expect(withBodyNoStatus.response).toEqual({});
  });
});
