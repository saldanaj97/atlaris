import { verifySignedRequest } from '../../../../workers/jobs/src/http/signature';
import { sendJobsWorkerCommand } from '@/lib/jobs-worker/client';
import {
  computeJobsSignature,
  JOBS_SIGNATURE_HEADER,
  JOBS_TIMESTAMP_HEADER,
} from '@/lib/jobs-worker/contract';
import { describe, expect, it, vi } from 'vitest';

const SECRET = 'current-secret-0123456789abcdef0123456789';
const PREVIOUS = 'previous-secret-0123456789abcdef012345678';
const NOW_MS = 1_790_000_000_000;
const NOW_S = String(NOW_MS / 1000);
const URL_BASE = 'https://workers-staging.atlaris.app';
const PATH = '/v1/regeneration/enqueue';
const BODY = JSON.stringify({
  v: 1,
  jobId: '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c',
});

async function signedRequest(
  options: {
    secret?: string;
    timestamp?: string;
    signMethod?: string;
    signPath?: string;
    signBody?: string;
    method?: string;
    path?: string;
    body?: string;
    signatureHeader?: (hex: string) => string;
  } = {},
): Promise<Request> {
  const timestamp = options.timestamp ?? NOW_S;
  const hex = await computeJobsSignature({
    secret: options.secret ?? SECRET,
    timestamp,
    method: options.signMethod ?? 'POST',
    path: options.signPath ?? PATH,
    body: options.signBody ?? BODY,
  });
  return new Request(`${URL_BASE}${options.path ?? PATH}`, {
    method: options.method ?? 'POST',
    headers: {
      [JOBS_TIMESTAMP_HEADER]: timestamp,
      [JOBS_SIGNATURE_HEADER]: (options.signatureHeader ?? ((h) => `v1=${h}`))(
        hex,
      ),
    },
    body: options.body ?? BODY,
  });
}

const secrets = { JOBS_SIGNING_SECRET: SECRET };

describe('verifySignedRequest', () => {
  it('accepts a valid signature and returns the signed body', async () => {
    await expect(
      verifySignedRequest(await signedRequest(), secrets, NOW_MS),
    ).resolves.toEqual({ ok: true, body: BODY });
  });

  it('accepts a timestamp at the edge of the 300 s window', async () => {
    const request = await signedRequest({
      timestamp: String(NOW_MS / 1000 - 300),
    });
    await expect(
      verifySignedRequest(request, secrets, NOW_MS),
    ).resolves.toMatchObject({
      ok: true,
    });
  });

  it.each([
    ['stale', NOW_MS / 1000 - 301],
    ['future', NOW_MS / 1000 + 301],
  ])('rejects a %s timestamp', async (_label, seconds) => {
    const request = await signedRequest({ timestamp: String(seconds) });
    await expect(
      verifySignedRequest(request, secrets, NOW_MS),
    ).resolves.toEqual({
      ok: false,
    });
  });

  it('rejects a tampered body', async () => {
    const request = await signedRequest({
      body: JSON.stringify({
        v: 1,
        jobId: '00000000-0000-4000-8000-000000000000',
      }),
    });
    await expect(
      verifySignedRequest(request, secrets, NOW_MS),
    ).resolves.toEqual({
      ok: false,
    });
  });

  it('rejects a signature made for another method', async () => {
    const request = await signedRequest({ signMethod: 'PUT' });
    await expect(
      verifySignedRequest(request, secrets, NOW_MS),
    ).resolves.toEqual({
      ok: false,
    });
  });

  it('rejects a signature made for another path', async () => {
    const request = await signedRequest({
      signPath: '/v1/module-lessons/start',
    });
    await expect(
      verifySignedRequest(request, secrets, NOW_MS),
    ).resolves.toEqual({
      ok: false,
    });
  });

  it('rejects a signature from an unknown secret', async () => {
    const request = await signedRequest({ secret: 'someone-else' });
    await expect(
      verifySignedRequest(request, secrets, NOW_MS),
    ).resolves.toEqual({
      ok: false,
    });
  });

  it('accepts the previous secret during rotation', async () => {
    const request = await signedRequest({ secret: PREVIOUS });
    await expect(
      verifySignedRequest(
        request,
        { JOBS_SIGNING_SECRET: SECRET, JOBS_SIGNING_SECRET_PREVIOUS: PREVIOUS },
        NOW_MS,
      ),
    ).resolves.toEqual({ ok: true, body: BODY });
  });

  it('rejects the previous secret once rotation ends', async () => {
    const request = await signedRequest({ secret: PREVIOUS });
    await expect(
      verifySignedRequest(request, secrets, NOW_MS),
    ).resolves.toEqual({
      ok: false,
    });
  });

  it('rejects everything when no secret is configured', async () => {
    await expect(
      verifySignedRequest(await signedRequest(), {}, NOW_MS),
    ).resolves.toEqual({ ok: false });
  });

  it.each([
    ['missing version prefix', (hex: string) => hex],
    ['unknown version', (hex: string) => `v2=${hex}`],
    ['uppercase hex', (hex: string) => `v1=${hex.toUpperCase()}`],
  ])('rejects a malformed signature header (%s)', async (_label, header) => {
    const request = await signedRequest({ signatureHeader: header });
    await expect(
      verifySignedRequest(request, secrets, NOW_MS),
    ).resolves.toEqual({
      ok: false,
    });
  });

  it('rejects a non-numeric timestamp', async () => {
    const request = await signedRequest({ timestamp: `${NOW_S}.5` });
    await expect(
      verifySignedRequest(request, secrets, NOW_MS),
    ).resolves.toEqual({
      ok: false,
    });
  });

  it('accepts a request sent by the app client', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 202 }),
    );
    await sendJobsWorkerCommand(
      PATH,
      { v: 1, jobId: '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c' },
      {
        config: { url: URL_BASE, signingSecret: SECRET },
        fetch: fetchMock,
        now: () => NOW_MS,
      },
    );
    const [url, init] = fetchMock.mock.calls[0]!;

    await expect(
      verifySignedRequest(new Request(url, init), secrets, NOW_MS),
    ).resolves.toEqual({ ok: true, body: BODY });
  });
});
