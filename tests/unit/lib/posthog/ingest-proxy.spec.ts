import {
  POSTHOG_INGEST_MAX_BODY_BYTES,
  proxyIngestRequest,
} from '@/lib/posthog/ingest-proxy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const US_INGEST = 'https://us.i.posthog.com';
const US_ASSETS = 'https://us-assets.i.posthog.com';

function jsonBodyRequest(
  url: string,
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
  return new Request(url, init);
}

function fetchCall(): { url: string; init: RequestInit } {
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
  return { url: String(url), init: init ?? {} };
}

function outboundHeaders(): Headers {
  return new Headers(fetchCall().init.headers);
}

describe('proxyIngestRequest', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"ok":true}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('strips Cookie, Authorization, Clerk, and forwarding headers from the upstream request', async () => {
    const response = await proxyIngestRequest(
      jsonBodyRequest('http://localhost/ingest/e/', '{"event":"x"}', {
        Cookie: '__Host-atlaris_proxy_sentinel=secret',
        Authorization: 'Bearer atlaris-proxy-sentinel',
        'Proxy-Authorization': 'Basic abc',
        'Clerk-Db-Jwt': 'clerk-jwt',
        'x-clerk-auth-status': 'signed-in',
        Forwarded: 'for=1.1.1.1',
        'X-Forwarded-For': '8.8.8.8',
        'X-Forwarded-Host': 'app.example',
        'X-Real-IP': '9.9.9.9',
        'X-Vercel-Id': 'id',
        'CF-Connecting-IP': '7.7.7.7',
        Host: 'app.example',
        Connection: 'keep-alive',
        'Transfer-Encoding': 'chunked',
        'X-Atlaris-Sentinel': 'header-sentinel',
        'User-Agent': 'Mozilla/5.0',
      }),
    );

    expect(response.status).toBe(200);
    const headers = outboundHeaders();
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.has('cookie')).toBe(false);
    expect(headers.has('authorization')).toBe(false);
    expect(headers.has('proxy-authorization')).toBe(false);
    expect(headers.has('clerk-db-jwt')).toBe(false);
    expect(headers.has('x-clerk-auth-status')).toBe(false);
    expect(headers.has('forwarded')).toBe(false);
    expect(headers.has('x-forwarded-for')).toBe(false);
    expect(headers.has('x-forwarded-host')).toBe(false);
    expect(headers.has('x-real-ip')).toBe(false);
    expect(headers.has('x-vercel-id')).toBe(false);
    expect(headers.has('cf-connecting-ip')).toBe(false);
    expect(headers.has('host')).toBe(false);
    expect(headers.has('connection')).toBe(false);
    expect(headers.has('transfer-encoding')).toBe(false);
    expect(headers.has('content-length')).toBe(false);
    expect(headers.has('x-atlaris-sentinel')).toBe(false);
    expect(headers.has('user-agent')).toBe(false);
    expect(fetchCall().url).toBe(`${US_INGEST}/e/`);
    expect(fetchCall().init.redirect).toBe('manual');
    expect(fetchCall().init.credentials).toBe('omit');
  });

  it('strips Set-Cookie, WWW-Authenticate, Server, Location, and tracing from the downstream response', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response('captured', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'upstream_proxy_sentinel=1; Path=/; Secure; HttpOnly',
          'WWW-Authenticate': 'Bearer realm="posthog"',
          Server: 'nginx',
          Location: 'https://evil.example/steal',
          Connection: 'keep-alive',
          'Transfer-Encoding': 'chunked',
          'x-request-id': 'upstream-trace',
          'sentry-trace': 'abc',
          'cf-ray': 'ray',
        },
      }),
    );

    const response = await proxyIngestRequest(
      jsonBodyRequest('http://localhost/ingest/e/', '{"event":"x"}'),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('captured');
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('www-authenticate')).toBeNull();
    expect(response.headers.get('server')).toBeNull();
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('connection')).toBeNull();
    expect(response.headers.get('x-request-id')).toBeNull();
    expect(response.headers.get('sentry-trace')).toBeNull();
    expect(response.headers.get('cf-ray')).toBeNull();
  });

  it('forwards a capture POST to the configured ingest origin', async () => {
    const response = await proxyIngestRequest(
      jsonBodyRequest(
        'http://localhost/ingest/e/?compression=gzip-js',
        '{"batch":[]}',
        { 'content-encoding': 'gzip' },
      ),
    );

    expect(response.status).toBe(200);
    expect(fetchCall().url).toBe(`${US_INGEST}/e/?compression=gzip-js`);
    expect(fetchCall().init.method).toBe('POST');
    expect(outboundHeaders().get('content-encoding')).toBe('gzip');
  });

  it('forwards a session-replay POST to the exact /s/ ingest path', async () => {
    const response = await proxyIngestRequest(
      jsonBodyRequest(
        'http://localhost/ingest/s/?compression=gzip-js',
        '{"batch":[]}',
        { 'content-encoding': 'gzip' },
      ),
    );

    expect(response.status).toBe(200);
    expect(fetchCall().url).toBe(`${US_INGEST}/s/?compression=gzip-js`);
    expect(fetchCall().init.method).toBe('POST');
    expect(outboundHeaders().get('content-encoding')).toBe('gzip');
  });

  it('rejects /ingest/s without the trailing slash before fetch', async () => {
    const response = await proxyIngestRequest(
      jsonBodyRequest('http://localhost/ingest/s', '{"batch":[]}'),
    );
    expect(response.status).toBe(404);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('forwards a flags POST with the installed query surface', async () => {
    const response = await proxyIngestRequest(
      jsonBodyRequest(
        'http://localhost/ingest/flags/?v=2&only_evaluate_survey_feature_flags=true&compression=base64',
        'data=abc',
        { 'content-type': 'application/x-www-form-urlencoded' },
      ),
    );

    expect(response.status).toBe(200);
    expect(fetchCall().url).toBe(
      `${US_INGEST}/flags/?v=2&only_evaluate_survey_feature_flags=true&compression=base64`,
    );
  });

  it('forwards array config and static asset GETs to the assets origin', async () => {
    const config = await proxyIngestRequest(
      new Request('http://localhost/ingest/array/phc_testtoken/config'),
    );
    expect(config.status).toBe(200);
    expect(fetchCall().url).toBe(`${US_ASSETS}/array/phc_testtoken/config`);
    expect(fetchCall().init.method).toBe('GET');
    expect(fetchCall().init.body).toBeUndefined();

    vi.mocked(globalThis.fetch).mockClear();
    const configJs = await proxyIngestRequest(
      new Request('http://localhost/ingest/array/phc_testtoken/config.js'),
    );
    expect(configJs.status).toBe(200);
    expect(fetchCall().url).toBe(`${US_ASSETS}/array/phc_testtoken/config.js`);

    vi.mocked(globalThis.fetch).mockClear();
    const script = await proxyIngestRequest(
      new Request(
        'http://localhost/ingest/static/recorder.js?v=1.415.1&t=1234567890',
        { method: 'HEAD' },
      ),
    );
    expect(script.status).toBe(200);
    expect(fetchCall().url).toBe(
      `${US_ASSETS}/static/recorder.js?v=1.415.1&t=1234567890`,
    );
    expect(fetchCall().init.method).toBe('HEAD');

    vi.mocked(globalThis.fetch).mockClear();
    const versioned = await proxyIngestRequest(
      new Request(
        'http://localhost/ingest/static/1.415.1/exception-autocapture.js',
      ),
    );
    expect(versioned.status).toBe(200);
    expect(fetchCall().url).toBe(
      `${US_ASSETS}/static/1.415.1/exception-autocapture.js`,
    );
  });

  it('preserves a self-hosted base path and ignores request-selected hosts', async () => {
    vi.stubEnv(
      'NEXT_PUBLIC_POSTHOG_HOST',
      'https://posthog.example.com/analytics/',
    );

    const response = await proxyIngestRequest(
      jsonBodyRequest('http://localhost/ingest/e/?compression=base64', '{}'),
    );

    expect(response.status).toBe(200);
    expect(fetchCall().url).toBe(
      'https://posthog.example.com/analytics/e/?compression=base64',
    );
  });

  it.each([
    'http://localhost/ingest',
    'http://localhost/ingest/',
    'http://localhost/ingest/unknown',
    'http://localhost/ingest/e/extra',
    'http://localhost/ingest/s/extra',
    'http://localhost/ingest/s/replay',
    'http://localhost/ingest/static/not-a-kind.js',
    'http://localhost/ingest/static/../recorder.js',
    'http://localhost/ingest/e%2Fextra',
    'http://localhost/ingest/%2e%2e/e/',
    'http://localhost/ingest/e%2f',
    'http://localhost/ingest//e/',
    'http://localhost/ingest/e/?host=https://evil.example',
    'http://localhost/ingest/flags/?v=1',
    'http://localhost/ingest/array/phc_test/config?callback=1',
  ])('rejects %s before fetch', async (url) => {
    const response = await proxyIngestRequest(
      jsonBodyRequest(url, '{"event":"x"}'),
    );
    expect(response.status).toBe(404);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects backslash and dot-segment paths before fetch', async () => {
    const slash = await proxyIngestRequest(
      new Request('http://localhost/ingest/e\\foo'),
    );
    expect(slash.status).toBe(404);

    const dots = await proxyIngestRequest(
      new Request('http://localhost/ingest/foo/../../e/'),
    );
    expect(dots.status).toBe(404);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns 405 with Allow and does not fetch for unsupported methods', async () => {
    const getCapture = await proxyIngestRequest(
      new Request('http://localhost/ingest/e/'),
    );
    expect(getCapture.status).toBe(405);
    expect(getCapture.headers.get('Allow')).toBe('POST');

    const postAsset = await proxyIngestRequest(
      jsonBodyRequest('http://localhost/ingest/static/recorder.js', '{}'),
    );
    expect(postAsset.status).toBe(405);
    expect(postAsset.headers.get('Allow')).toBe('GET, HEAD');

    const options = await proxyIngestRequest(
      new Request('http://localhost/ingest/e/', { method: 'OPTIONS' }),
    );
    expect(options.status).toBe(405);
    expect(options.headers.get('Allow')).toBe('POST');

    const put = await proxyIngestRequest(
      new Request('http://localhost/ingest/e/', { method: 'PUT' }),
    );
    expect(put.status).toBe(405);

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects a declared oversized capture body before reading it', async () => {
    const pull = vi.fn(() => {
      throw new Error('body should not be read');
    });
    const response = await proxyIngestRequest(
      jsonBodyRequest(
        'http://localhost/ingest/e/',
        new ReadableStream<Uint8Array>({ pull, cancel: vi.fn() }),
        { 'content-length': String(POSTHOG_INGEST_MAX_BODY_BYTES + 1) },
      ),
    );

    expect(response.status).toBe(413);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(pull).not.toHaveBeenCalled();
  });

  it('rejects a streamed body that crosses the cap and cancels the reader', async () => {
    const cancel = vi.fn();
    const chunk = new Uint8Array(POSTHOG_INGEST_MAX_BODY_BYTES);
    const overflow = new Uint8Array(1);
    const response = await proxyIngestRequest(
      jsonBodyRequest(
        'http://localhost/ingest/e/',
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(chunk);
            controller.enqueue(overflow);
          },
          cancel,
        }),
      ),
    );

    expect(response.status).toBe(413);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });

  it('forwards a capture body that is exactly at the 1 MiB cap', async () => {
    const body = 'x'.repeat(POSTHOG_INGEST_MAX_BODY_BYTES);
    const response = await proxyIngestRequest(
      jsonBodyRequest('http://localhost/ingest/e/', body, {
        'content-type': 'text/plain',
        'content-length': String(POSTHOG_INGEST_MAX_BODY_BYTES),
      }),
    );

    expect(response.status).toBe(200);
    const sent = fetchCall().init.body;
    expect(sent).toBeInstanceOf(Uint8Array);
    expect((sent as Uint8Array).byteLength).toBe(POSTHOG_INGEST_MAX_BODY_BYTES);
  });

  it('rejects a body on an asset path before fetch', async () => {
    const response = await proxyIngestRequest(
      new Request('http://localhost/ingest/array/phc_test/config', {
        method: 'GET',
        headers: { 'content-length': '12' },
      }),
    );
    expect(response.status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects an upstream redirect without returning Location or Set-Cookie', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          Location: 'https://evil.example/phish',
          'Set-Cookie': 'stolen=1',
        },
      }),
    );

    const response = await proxyIngestRequest(
      jsonBodyRequest('http://localhost/ingest/e/', '{}'),
    );

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(502);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('returns 504 when the upstream timeout signal aborts', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(
      AbortSignal.abort(new DOMException('Timed out', 'TimeoutError')),
    );
    vi.mocked(globalThis.fetch).mockImplementation((_url, init) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        return Promise.reject(signal.reason);
      }
      return Promise.reject(new Error('should have been aborted'));
    });

    const response = await proxyIngestRequest(
      jsonBodyRequest('http://localhost/ingest/e/', '{}'),
    );

    expect(response.status).toBe(504);
    expect(AbortSignal.timeout).toHaveBeenCalled();
  });

  it('rejects http non-loopback origins before fetch', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'http://posthog.example.com');
    const response = await proxyIngestRequest(
      jsonBodyRequest('http://localhost/ingest/e/', '{}'),
    );
    expect(response.status).toBe(502);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('allows http loopback origins in test', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'http://localhost:8000');
    const response = await proxyIngestRequest(
      jsonBodyRequest('http://localhost/ingest/e/', '{}'),
    );
    expect(response.status).toBe(200);
    expect(fetchCall().url).toBe('http://localhost:8000/e/');
  });
});
