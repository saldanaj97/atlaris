import {
  JOBS_WORKER_TIMEOUT_MS,
  sendJobsWorkerCommand,
} from '@/lib/jobs-worker/client';
import {
  computeJobsSignature,
  JOBS_SIGNATURE_HEADER,
  JOBS_TIMESTAMP_HEADER,
} from '@/lib/jobs-worker/contract';
import { describe, expect, it, vi } from 'vitest';

const SECRET = 'current-secret-0123456789abcdef0123456789';
const NOW_MS = 1_790_000_000_000;
const config = {
  url: 'https://workers-staging.atlaris.app',
  signingSecret: SECRET,
};
const payload = { v: 1, jobId: '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c' };

function fetchReturning(response: Response) {
  return vi.fn<typeof fetch>(async () => response);
}

describe('sendJobsWorkerCommand', () => {
  it('signs the request with the shared contract', async () => {
    const fetchMock = fetchReturning(
      Response.json({ accepted: true }, { status: 202 }),
    );

    const result = await sendJobsWorkerCommand(
      '/v1/regeneration/enqueue',
      payload,
      { config, fetch: fetchMock, now: () => NOW_MS },
    );

    expect(result).toEqual({
      kind: 'accepted',
      status: 202,
      body: { accepted: true },
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://workers-staging.atlaris.app/v1/regeneration/enqueue',
    );
    expect(init?.method).toBe('POST');
    // Worker-side acceptance of these headers: tests/unit/workers/jobs/signature.spec.ts.
    const headers = new Headers(init?.headers);
    const body = JSON.stringify(payload);
    expect(init?.body).toBe(body);
    expect(headers.get(JOBS_TIMESTAMP_HEADER)).toBe(String(NOW_MS / 1000));
    expect(headers.get(JOBS_SIGNATURE_HEADER)).toBe(
      `v1=${await computeJobsSignature({
        secret: SECRET,
        timestamp: String(NOW_MS / 1000),
        method: 'POST',
        path: '/v1/regeneration/enqueue',
        body,
      })}`,
    );
  });

  it('sets a 10 second timeout signal', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetchMock = fetchReturning(new Response(null, { status: 202 }));

    await sendJobsWorkerCommand('/v1/regeneration/enqueue', payload, {
      config,
      fetch: fetchMock,
    });

    expect(JOBS_WORKER_TIMEOUT_MS).toBe(10_000);
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    timeout.mockRestore();
  });

  it('reports a timeout without retrying', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });

    await expect(
      sendJobsWorkerCommand('/v1/regeneration/enqueue', payload, {
        config,
        fetch: fetchMock,
      }),
    ).resolves.toEqual({ kind: 'unavailable', reason: 'timeout' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts a slow Worker after the timeout', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          );
        }),
    );

    await expect(
      sendJobsWorkerCommand('/v1/regeneration/enqueue', payload, {
        config,
        fetch: fetchMock,
        timeoutMs: 5,
      }),
    ).resolves.toEqual({ kind: 'unavailable', reason: 'timeout' });
  });

  it('reports a network failure', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(
      sendJobsWorkerCommand('/v1/regeneration/enqueue', payload, {
        config,
        fetch: fetchMock,
      }),
    ).resolves.toEqual({ kind: 'unavailable', reason: 'network' });
  });

  it.each([
    [
      Response.json({ code: 'jobs_paused' }, { status: 503 }),
      503,
      'jobs_paused',
    ],
    [new Response(null, { status: 401 }), 401, undefined],
    [new Response('boom', { status: 500 }), 500, undefined],
  ])(
    'returns non-2xx responses as rejected (%#)',
    async (response, status, code) => {
      await expect(
        sendJobsWorkerCommand('/v1/regeneration/enqueue', payload, {
          config,
          fetch: fetchReturning(response),
        }),
      ).resolves.toEqual({ kind: 'rejected', status, code });
    },
  );

  it.each([
    [{ url: undefined, signingSecret: SECRET }],
    [{ url: config.url, signingSecret: undefined }],
  ])('does not call the Worker when not configured', async (partial) => {
    const fetchMock = fetchReturning(new Response(null, { status: 202 }));

    await expect(
      sendJobsWorkerCommand('/v1/regeneration/enqueue', payload, {
        config: partial,
        fetch: fetchMock,
      }),
    ).resolves.toEqual({ kind: 'unavailable', reason: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
