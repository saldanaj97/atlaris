import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logging/logger', () => {
  const stubLogger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  };
  return {
    createLogger: () => ({
      ...stubLogger,
      child: () => stubLogger,
    }),
  };
});

import {
  REQUEST_ID_HEADER,
  attachRequestIdHeader,
  createRequestContext,
} from '@/lib/logging/request-context';

describe('createRequestContext', () => {
  it('reuses the incoming request ID header when present', () => {
    const headers = new Headers([[REQUEST_ID_HEADER, 'req-123']]);

    const context = createRequestContext({ headers });

    expect(context.requestId).toBe('req-123');
  });

  it('generates a new request ID when header is missing', () => {
    const headers = new Headers();

    const context = createRequestContext({ headers });

    expect(context.requestId).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

describe('attachRequestIdHeader', () => {
  it('sets the request ID header if not already present', () => {
    const response = new Response('ok');

    const result = attachRequestIdHeader(response, 'req-456');

    expect(result.headers.get(REQUEST_ID_HEADER)).toBe('req-456');
  });

  it('preserves existing request ID headers', () => {
    const response = new Response('ok', {
      headers: new Headers([[REQUEST_ID_HEADER, 'existing']]),
    });

    const result = attachRequestIdHeader(response, 'new-value');

    expect(result.headers.get(REQUEST_ID_HEADER)).toBe('existing');
  });
});
