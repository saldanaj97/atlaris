import { describe, expect, it } from 'vitest';

import { coerceUnknownToMessage } from '@/lib/api/coerce-unknown-to-message';

describe('coerceUnknownToMessage', () => {
  describe('primitives', () => {
    it('passes through a string unchanged', () => {
      const result = coerceUnknownToMessage('hello');
      expect(result).toBe('hello');
      expect(typeof result).toBe('string');
    });

    it('converts a number to string', () => {
      const result = coerceUnknownToMessage(42);
      expect(result).toBe('42');
      expect(typeof result).toBe('string');
    });

    it('converts true to string', () => {
      const result = coerceUnknownToMessage(true);
      expect(result).toBe('true');
      expect(typeof result).toBe('string');
    });

    it('converts false to string', () => {
      const result = coerceUnknownToMessage(false);
      expect(result).toBe('false');
      expect(typeof result).toBe('string');
    });

    it('converts null to string', () => {
      const result = coerceUnknownToMessage(null);
      expect(result).toBe('null');
      expect(typeof result).toBe('string');
    });

    it('converts undefined to string', () => {
      const result = coerceUnknownToMessage(undefined);
      expect(result).toBe('undefined');
      expect(typeof result).toBe('string');
    });
  });

  describe('objects', () => {
    it('extracts message from an Error', () => {
      const result = coerceUnknownToMessage(new Error('boom'));
      expect(result).toBe('boom');
      expect(typeof result).toBe('string');
    });

    it('extracts message from a plain object with message property', () => {
      const result = coerceUnknownToMessage({ message: 'oops' });
      expect(result).toBe('oops');
      expect(typeof result).toBe('string');
    });

    it('JSON-stringifies a plain object without message', () => {
      const result = coerceUnknownToMessage({ foo: 'bar' });
      expect(result).toBe('{"foo":"bar"}');
      expect(typeof result).toBe('string');
    });

    it('JSON-stringifies an array', () => {
      const result = coerceUnknownToMessage([1, 2, 3]);
      expect(result).toBe('[1,2,3]');
      expect(typeof result).toBe('string');
    });
  });

  describe('symbols and functions', () => {
    it('converts a named symbol to string', () => {
      const result = coerceUnknownToMessage(Symbol('test'));
      expect(result).toBe('Symbol(test)');
      expect(typeof result).toBe('string');
    });

    it('converts an unnamed symbol to string', () => {
      const result = coerceUnknownToMessage(Symbol());
      expect(result).toBe('Symbol()');
      expect(typeof result).toBe('string');
    });

    it('converts a named function to string', () => {
      function myFunc() {}
      const result = coerceUnknownToMessage(myFunc);
      expect(result).toBe('[Function: myFunc]');
      expect(typeof result).toBe('string');
    });

    it('converts an anonymous function to string', () => {
      const result = coerceUnknownToMessage(() => {});
      expect(result).toContain('[Function:');
      expect(typeof result).toBe('string');
    });
  });

  describe('edge cases', () => {
    it('returns fallback for BigInt (JSON.stringify throws)', () => {
      const result = coerceUnknownToMessage(BigInt(42));
      expect(result).toBe('Unserializable thrown value');
      expect(typeof result).toBe('string');
    });

    it('returns fallback for circular references', () => {
      const obj: Record<string, unknown> = {};
      obj.self = obj;
      const result = coerceUnknownToMessage(obj);
      expect(result).toBe('Unserializable thrown value');
      expect(typeof result).toBe('string');
    });

    it('always returns a string for every input type', () => {
      const inputs: unknown[] = [
        'hello',
        42,
        true,
        false,
        null,
        undefined,
        new Error('boom'),
        { message: 'oops' },
        { foo: 'bar' },
        [1, 2, 3],
        Symbol('test'),
        Symbol(),
        function myFunc() {},
        () => {},
        BigInt(42),
      ];

      for (const input of inputs) {
        expect(typeof coerceUnknownToMessage(input)).toBe('string');
      }
    });
  });
});
