import { describe, expect, it } from 'vitest';
import {
  coerceUnknownToMessage,
  omitCircularFields,
  safeStringifyUnknown,
  unknownThrownCore,
} from '@/lib/errors/normalize-unknown';

describe('normalize-unknown', () => {
  describe('unknownThrownCore', () => {
    it('captures Error instances', () => {
      const err = new Error('boom');
      err.name = 'CustomError';
      const core = unknownThrownCore(err);
      expect(core.errorInstance).toBe(err);
      expect(core.primaryMessage).toBe('boom');
      expect(core.name).toBe('CustomError');
      expect(typeof core.stack).toBe('string');
      expect(core.stack).toContain('CustomError');
      expect(core.stack).toContain('boom');
    });

    it('captures plain objects with message using the structured contract', () => {
      const cause = { reason: 'timeout' };
      const core = unknownThrownCore({
        message: 'oops',
        name: 'X',
        stack: 'plain-stack',
        cause,
      });
      expect(core.errorInstance).toBeUndefined();
      expect(core.primaryMessage).toBe('oops');
      expect(core.name).toBe('X');
      expect(core.stack).toBe('plain-stack');
      expect(core.cause).toBe(cause);
    });

    it('omits cause when plain objects do not define one', () => {
      const core = unknownThrownCore({ message: 'oops' });
      expect(core).not.toHaveProperty('cause');
    });

    it('falls back to coercion for primitives', () => {
      expect(unknownThrownCore(42).primaryMessage).toBe('42');
      expect(unknownThrownCore('hi').primaryMessage).toBe('hi');
    });

    it('handles null and undefined inputs gracefully', () => {
      expect(unknownThrownCore(null).primaryMessage).toBe('null');
      expect(unknownThrownCore(undefined).primaryMessage).toBe('undefined');
    });

    it('detects abort-shaped objects', () => {
      const core = unknownThrownCore({
        name: 'AbortError',
        message: 'aborted',
      });
      expect(core.name).toBe('AbortError');
      expect(core.primaryMessage).toBe('aborted');
    });
  });

  describe('omitCircularFields + safeStringifyUnknown', () => {
    it('replaces circular refs', () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj.self = obj;
      expect(omitCircularFields(obj)).toEqual({ a: 1, self: '[Circular]' });
      expect(safeStringifyUnknown(obj)).toBe('{"a":1,"self":"[Circular]"}');
    });

    it('stringifies bigint as string', () => {
      expect(safeStringifyUnknown({ x: BigInt(1) })).toBe('{"x":"1"}');
    });
  });

  describe('coerceUnknownToMessage', () => {
    it.each([
      ['x', 'x'],
      [42, '42'],
      [true, 'true'],
      [BigInt(7), '7'],
      [null, 'null'],
      [undefined, 'undefined'],
    ])('coerces primitive %p', (value, expected) => {
      expect(coerceUnknownToMessage(value)).toBe(expected);
    });

    it('coerces symbols and functions', () => {
      expect(coerceUnknownToMessage(Symbol.for('token'))).toBe('Symbol(token)');
      expect(coerceUnknownToMessage(function namedFn() {})).toBe(
        '[Function: namedFn]'
      );
    });

    it('prefers message fields on object values', () => {
      expect(
        coerceUnknownToMessage({ message: 'object-message', extra: true })
      ).toBe('object-message');
    });

    it('serializes other non-primitive values', () => {
      expect(coerceUnknownToMessage(['a', 1])).toBe('["a",1]');
      expect(coerceUnknownToMessage({ nested: { ok: true } })).toBe(
        '{"nested":{"ok":true}}'
      );
    });
  });
});
