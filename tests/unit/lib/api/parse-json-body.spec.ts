import { AppError } from '@/lib/api/errors';
import {
  detectJsonBodyPresence,
  parseJsonBody,
} from '@/lib/api/parse-json-body';
import { describe, expect, it, vi } from 'vitest';

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
  const request = new Request('http://localhost/parse-json-body', { headers });
  Object.defineProperty(request, 'json', {
    value: init.json,
  });
  return request;
}

function jsonBodyRequest(
  body: BodyInit,
  headers: Record<string, string> = {},
): Request {
  const init: RequestInit & { duplex?: string } = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body,
  };
  if (body instanceof ReadableStream) {
    init.duplex = 'half';
  }
  return new Request('http://localhost/parse-json-body', init);
}

function expectPayloadTooLarge(error: unknown): asserts error is AppError {
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).message).toBe('payload too large');
  expect((error as AppError).status()).toBe(413);
  expect((error as AppError).code()).toBe('PAYLOAD_TOO_LARGE');
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
      }),
    ).resolves.toEqual({ a: 1 });
  });

  it('required mode: returns undefined when json resolves to undefined', async () => {
    const req = mockRequest({
      json: () => Promise.resolve(undefined),
    });
    const factory = vi.fn((_err: unknown) => new Error('should not run'));
    await expect(
      parseJsonBody(req, { mode: 'required', onMalformedJson: factory }),
    ).resolves.toBeUndefined();
    expect(factory).not.toHaveBeenCalled();
  });

  it('required mode: returns null when json resolves to null without invoking factory', async () => {
    const req = mockRequest({
      json: () => Promise.resolve(null),
    });
    const factory = vi.fn(() => new Error('should not run'));
    await expect(
      parseJsonBody(req, { mode: 'required', onMalformedJson: factory }),
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
      parseJsonBody(req, { mode: 'required', onMalformedJson: factory }),
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
      parseJsonBody(req, { mode: 'required', onMalformedJson: factory }),
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
      parseJsonBody(req, { mode: 'required', onMalformedJson: factory }),
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
      parseJsonBody(req, { mode: 'required', onMalformedJson: factory }),
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
      }),
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
      parseJsonBody(req, { mode: 'optional', onMalformedJson: factory }),
    ).rejects.toThrow('malformed');
    expect(factory).toHaveBeenCalledWith(syntaxErr);
  });

  it('optional mode: rethrows non-SyntaxError when body detection is optional', async () => {
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
      }),
    ).rejects.toThrow('read failed');
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
      }),
    ).resolves.toEqual({});
  });

  it('optional mode: rethrows non-SyntaxError when no body is detected', async () => {
    const typeErr = new TypeError('stream failed');
    const req = mockRequest({
      headers: {},
      json: () => Promise.reject(typeErr),
    });
    const factory = vi.fn(() => new Error('should not run'));

    await expect(
      parseJsonBody(req, {
        mode: 'optional',
        onMalformedJson: factory,
        fallback: {},
      }),
    ).rejects.toBe(typeErr);
    expect(factory).not.toHaveBeenCalled();
  });

  it('maxBytes: parses a body below the cap', async () => {
    const body = '{"ok":true}';
    const req = jsonBodyRequest(body);
    const jsonSpy = vi.spyOn(req, 'json');

    await expect(
      parseJsonBody(req, {
        mode: 'required',
        onMalformedJson: () => new Error('should not run'),
        maxBytes: new TextEncoder().encode(body).byteLength + 1,
      }),
    ).resolves.toEqual({ ok: true });
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('maxBytes: parses a body equal to the cap', async () => {
    const body = '{"ok":true}';
    const req = jsonBodyRequest(body);

    await expect(
      parseJsonBody(req, {
        mode: 'required',
        onMalformedJson: () => new Error('should not run'),
        maxBytes: new TextEncoder().encode(body).byteLength,
      }),
    ).resolves.toEqual({ ok: true });
  });

  it('maxBytes: rejects an oversized Content-Length without reading the body', async () => {
    const pull = vi.fn(() => {
      throw new Error('body should not be read');
    });
    const cancel = vi.fn();
    const req = jsonBodyRequest(
      new ReadableStream<Uint8Array>({ pull, cancel }),
      { 'content-length': '64' },
    );
    const jsonSpy = vi.spyOn(req, 'json');
    const factory = vi.fn(() => new Error('should not run'));

    const error = await parseJsonBody(req, {
      mode: 'required',
      onMalformedJson: factory,
      maxBytes: 16,
    }).catch((err: unknown) => err);

    expectPayloadTooLarge(error);
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
  });

  it('maxBytes: rejects a chunked body that understates Content-Length', async () => {
    const encoder = new TextEncoder();
    const cancel = vi.fn();
    const req = jsonBodyRequest(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('{"pad":"'));
          controller.enqueue(encoder.encode(`${'x'.repeat(32)}"}`));
          controller.close();
        },
        cancel,
      }),
      { 'content-length': '4' },
    );
    const factory = vi.fn(() => new Error('should not run'));

    const error = await parseJsonBody(req, {
      mode: 'required',
      onMalformedJson: factory,
      maxBytes: 16,
    }).catch((err: unknown) => err);

    expectPayloadTooLarge(error);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(factory).not.toHaveBeenCalled();
  });

  it('maxBytes: counts UTF-8 bytes rather than JavaScript characters', async () => {
    const payload = '{"x":"é"}';
    const encoded = new TextEncoder().encode(payload);
    expect(encoded.byteLength).toBeGreaterThan(payload.length);

    const streamBody = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoded.slice());
          controller.close();
        },
      });

    const overCharCap = await parseJsonBody(jsonBodyRequest(streamBody()), {
      mode: 'required',
      onMalformedJson: () => new Error('should not run'),
      maxBytes: payload.length,
    }).catch((err: unknown) => err);
    expectPayloadTooLarge(overCharCap);

    await expect(
      parseJsonBody(jsonBodyRequest(streamBody()), {
        mode: 'required',
        onMalformedJson: () => new Error('should not run'),
        maxBytes: encoded.byteLength,
      }),
    ).resolves.toEqual({ x: 'é' });
  });

  it('omitted maxBytes: keeps unbounded req.json() behavior', async () => {
    const huge = { pad: 'x'.repeat(10_000) };
    const req = mockRequest({
      json: () => Promise.resolve(huge),
    });

    await expect(
      parseJsonBody(req, {
        mode: 'required',
        onMalformedJson: () => new Error('should not run'),
      }),
    ).resolves.toEqual(huge);
  });

  it('required mode with maxBytes: malformed JSON still uses onMalformedJson', async () => {
    const syntaxBody = '{bad';
    const req = jsonBodyRequest(syntaxBody);
    const factory = vi.fn(() => new Error('from factory'));

    await expect(
      parseJsonBody(req, {
        mode: 'required',
        onMalformedJson: factory,
        maxBytes: 1024,
      }),
    ).rejects.toThrow('from factory');
    expect(factory).toHaveBeenCalledWith(expect.any(SyntaxError));
  });

  it('optional mode with maxBytes: empty undetected body still returns fallback', async () => {
    const req = new Request('http://localhost/parse-json-body', {
      method: 'POST',
    });
    const factory = vi.fn(() => new Error('should not run'));

    await expect(
      parseJsonBody(req, {
        mode: 'optional',
        onMalformedJson: factory,
        fallback: {},
        maxBytes: 1024,
      }),
    ).resolves.toEqual({});
    expect(factory).not.toHaveBeenCalled();
  });
});
