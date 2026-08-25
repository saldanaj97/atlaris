import {
  DELETE,
  GET,
  HEAD,
  OPTIONS,
  PATCH,
  POST,
  PUT,
  dynamic,
} from '@/app/ingest/[...path]/route';
import { proxyIngestRequest } from '@/lib/posthog/ingest-proxy';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('/ingest route', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes every exported method through the constrained proxy', () => {
    expect(dynamic).toBe('force-dynamic');
    for (const handler of [GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS]) {
      expect(handler).toBe(proxyIngestRequest);
    }
  });

  it('applies proxy path and method rejection at the public route', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const unknownPath = await POST(
      new Request('http://localhost/ingest/not-allowed', {
        method: 'POST',
      }),
    );
    const unsupportedMethod = await DELETE(
      new Request('http://localhost/ingest/e/', { method: 'DELETE' }),
    );

    expect(unknownPath.status).toBe(404);
    expect(unsupportedMethod.status).toBe(405);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
