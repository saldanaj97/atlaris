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
});
