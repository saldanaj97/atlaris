import { describe, expect, it, vi } from 'vitest';

import {
  detectJsonBodyPresence,
  parseJsonBody,
} from '@/lib/api/parse-json-body';

function mockRequest(init: {
  json: () => Promise<unknown>;
  headers?: Record<string, string | undefined>;
}): Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(init.headers ?? {})) {
    if (v !== undefined) {
      headers.set(k, v);
    }
  }
  return { headers, json: init.json } as unknown as Request;
}

describe('detectJsonBodyPresence', () => {
  it('is true when content-type includes application/json', () => {
    const req = mockRequest({
      headers: { 'content-type': 'application/json; charset=utf-8' },
      json: () => Promise.resolve({}),
    });
    expect(detectJsonBodyPresence(req)).toBe(true);
  });

  it('is true when content-length is a positive finite number string with surrounding whitespace', () => {
    const req = mockRequest({
      headers: { 'content-length': ' 12.5 ' },
      json: () => Promise.resolve({}),
    });
    expect(detectJsonBodyPresence(req)).toBe(true);
  });

  it('is false when content-length is 0', () => {
    const req = mockRequest({
      headers: { 'content-length': '0' },
      json: () => Promise.resolve({}),
    });
    expect(detectJsonBodyPresence(req)).toBe(false);
  });

  it('is false when there is no content-type json hint and no content-length', () => {
    const req = mockRequest({
      json: () => Promise.resolve({}),
    });
    expect(detectJsonBodyPresence(req)).toBe(false);
  });

  it('is false when content-length is zero with surrounding whitespace', () => {
    const req = mockRequest({
      headers: { 'content-length': '0 ' },
      json: () => Promise.resolve({}),
    });
    expect(detectJsonBodyPresence(req)).toBe(false);
  });

  it('is false when content-length is duplicate zero', () => {
    const req = mockRequest({
      headers: { 'content-length': '00' },
      json: () => Promise.resolve({}),
    });
    expect(detectJsonBodyPresence(req)).toBe(false);
  });

  it('is false when content-length is negative', () => {
    const req = mockRequest({
      headers: { 'content-length': '-1' },
      json: () => Promise.resolve({}),
    });
    expect(detectJsonBodyPresence(req)).toBe(false);
  });

  it('is false when content-length is not numeric', () => {
    const req = mockRequest({
      headers: { 'content-length': 'abc' },
      json: () => Promise.resolve({}),
    });
    expect(detectJsonBodyPresence(req)).toBe(false);
  });

  it('is false when content-length is whitespace only', () => {
    const req = mockRequest({
      headers: { 'content-length': '   ' },
      json: () => Promise.resolve({}),
    });
    expect(detectJsonBodyPresence(req)).toBe(false);
  });

  it('is true when content-length is a positive integer string', () => {
    const req = mockRequest({
      headers: { 'content-length': '10' },
      json: () => Promise.resolve({}),
    });
    expect(detectJsonBodyPresence(req)).toBe(true);
  });
});

describe('parseJsonBody', () => {
  it('required mode: returns parsed JSON', async () => {
    const req = mockRequest({
      json: () => Promise.resolve({ a: 1 }),
    });
    await expect(
      parseJsonBody(req, {
        mode: 'required',
        onMalformedJson: () => new Error('should not run'),
      })
    ).resolves.toEqual({ a: 1 });
  });

  it('required mode: returns undefined when json resolves to undefined', async () => {
    const req = mockRequest({
      json: () => Promise.resolve(undefined),
    });
    const factory = vi.fn((_err: unknown) => new Error('should not run'));
    await expect(
      parseJsonBody(req, { mode: 'required', onMalformedJson: factory })
    ).resolves.toBeUndefined();
    expect(factory).not.toHaveBeenCalled();
  });

  it('required mode: returns null when json resolves to null without invoking factory', async () => {
    const req = mockRequest({
      json: () => Promise.resolve(null),
    });
    const factory = vi.fn(() => new Error('should not run'));
    await expect(
      parseJsonBody(req, { mode: 'required', onMalformedJson: factory })
    ).resolves.toBeNull();
    expect(factory).not.toHaveBeenCalled();
  });

  it('required mode: invokes onMalformedJson for SyntaxError', async () => {
    const syntaxErr = new SyntaxError('Unexpected token');
    const req = mockRequest({
      json: () => Promise.reject(syntaxErr),
    });
    const factory = vi.fn(() => new Error('from factory'));
    await expect(
      parseJsonBody(req, { mode: 'required', onMalformedJson: factory })
    ).rejects.toThrow('from factory');
    expect(factory).toHaveBeenCalledWith(syntaxErr);
  });

  it('required mode: invokes onMalformedJson for non-SyntaxError rejections', async () => {
    const typeErr = new TypeError('boom');
    const req = mockRequest({
      json: () => Promise.reject(typeErr),
    });
    const factory = vi.fn(() => new Error('wrapped'));
    await expect(
      parseJsonBody(req, { mode: 'required', onMalformedJson: factory })
    ).rejects.toThrow('wrapped');
    expect(factory).toHaveBeenCalledWith(typeErr);
  });

  it('required mode: rethrows AbortError without calling onMalformedJson', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    const req = mockRequest({
      json: () => Promise.reject(abort),
    });
    const factory = vi.fn(() => new Error('should not run'));
    await expect(
      parseJsonBody(req, { mode: 'required', onMalformedJson: factory })
    ).rejects.toBe(abort);
    expect(factory).not.toHaveBeenCalled();
  });

  it('required mode: rethrows DOMException AbortError without calling onMalformedJson', async () => {
    if (typeof DOMException === 'undefined') {
      return;
    }
    const abort = new DOMException('Aborted', 'AbortError');
    const req = mockRequest({
      json: () => Promise.reject(abort),
    });
    const factory = vi.fn(() => new Error('should not run'));
    await expect(
      parseJsonBody(req, { mode: 'required', onMalformedJson: factory })
    ).rejects.toBe(abort);
    expect(factory).not.toHaveBeenCalled();
  });

  it('optional mode: returns fallback when body not detected and json rejects with SyntaxError', async () => {
    const req = mockRequest({
      headers: {},
      json: () => Promise.reject(new SyntaxError('empty')),
    });
    const factory = vi.fn(() => new Error('should not run'));
    await expect(
      parseJsonBody(req, {
        mode: 'optional',
        onMalformedJson: factory,
        fallback: {},
      })
    ).resolves.toEqual({});
    expect(factory).not.toHaveBeenCalled();
  });

  it('optional mode: throws via factory when body detected and SyntaxError', async () => {
    const syntaxErr = new SyntaxError('bad json');
    const req = mockRequest({
      headers: { 'content-type': 'application/json' },
      json: () => Promise.reject(syntaxErr),
    });
    const factory = vi.fn(() => new Error('malformed'));
    await expect(
      parseJsonBody(req, { mode: 'optional', onMalformedJson: factory })
    ).rejects.toThrow('malformed');
    expect(factory).toHaveBeenCalledWith(syntaxErr);
  });

  it('optional mode: silent fallback for non-SyntaxError even when body detected', async () => {
    const req = mockRequest({
      headers: { 'content-type': 'application/json' },
      json: () => Promise.reject(new TypeError('read failed')),
    });
    const factory = vi.fn(() => new Error('should not run'));
    await expect(
      parseJsonBody(req, {
        mode: 'optional',
        onMalformedJson: factory,
        fallback: {},
      })
    ).resolves.toEqual({});
    expect(factory).not.toHaveBeenCalled();
  });

  it('optional mode: uses {} when fallback omitted', async () => {
    const req = mockRequest({
      headers: {},
      json: () => Promise.reject(new SyntaxError('empty')),
    });
    await expect(
      parseJsonBody(req, {
        mode: 'optional',
        onMalformedJson: () => new Error('x'),
      })
    ).resolves.toEqual({});
  });
});
