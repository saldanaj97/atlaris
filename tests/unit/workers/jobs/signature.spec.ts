import {
  signatureFailureResponse,
  verifySignedRequest,
} from '../../../../workers/jobs/src/http/signature';
import { sendJobsWorkerCommand } from '@/lib/jobs-worker/client';
import {
  computeJobsSignature,
  JOBS_SIGNATURE_HEADER,
  JOBS_SIGNED_BODY_MAX_BYTES,
  JOBS_TIMESTAMP_HEADER,
  planGenerationStartCommandSchema,
} from '@/lib/jobs-worker/contract';
import {
  NOTES_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
} from '@/shared/constants/learning-plans';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
const UNAUTHORIZED = { ok: false, reason: 'unauthorized' };
const BODY_TOO_LARGE = { ok: false, reason: 'body_too_large' };

/** Headers for a validly signed request over `body`. */
async function signedHeaders(body: string): Promise<Record<string, string>> {
  const hex = await computeJobsSignature({
    secret: SECRET,
    timestamp: NOW_S,
    method: 'POST',
    path: PATH,
    body,
  });
  return {
    [JOBS_TIMESTAMP_HEADER]: NOW_S,
    [JOBS_SIGNATURE_HEADER]: `v1=${hex}`,
  };
}

/** A streamed body that records reads and cancellation. */
function trackedStream(chunks: Uint8Array[]) {
  const state = { pulls: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        state.pulls += 1;
        const chunk = chunks.shift();
        if (chunk === undefined) controller.close();
        else controller.enqueue(chunk);
      },
      cancel() {
        state.cancelled = true;
      },
    },
    // Nothing is pulled until the verifier reads.
    { highWaterMark: 0 },
  );
  return { stream, state };
}

function streamedRequest(
  stream: ReadableStream<Uint8Array>,
  headers: Record<string, string>,
): Request {
  return new Request(`${URL_BASE}${PATH}`, {
    method: 'POST',
    headers,
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: string });
}

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
    ).resolves.toEqual(UNAUTHORIZED);
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
    ).resolves.toEqual(UNAUTHORIZED);
  });

  it('rejects a signature made for another method', async () => {
    const request = await signedRequest({ signMethod: 'PUT' });
    await expect(
      verifySignedRequest(request, secrets, NOW_MS),
    ).resolves.toEqual(UNAUTHORIZED);
  });

  it('rejects a signature made for another path', async () => {
    const request = await signedRequest({
      signPath: '/v1/module-lessons/start',
    });
    await expect(
      verifySignedRequest(request, secrets, NOW_MS),
    ).resolves.toEqual(UNAUTHORIZED);
  });

  it('rejects a signature from an unknown secret', async () => {
    const request = await signedRequest({ secret: 'someone-else' });
    await expect(
      verifySignedRequest(request, secrets, NOW_MS),
    ).resolves.toEqual(UNAUTHORIZED);
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
    ).resolves.toEqual(UNAUTHORIZED);
  });

  it('rejects everything when no secret is configured', async () => {
    await expect(
      verifySignedRequest(await signedRequest(), {}, NOW_MS),
    ).resolves.toEqual(UNAUTHORIZED);
  });

  it.each([
    ['missing version prefix', (hex: string) => hex],
    ['unknown version', (hex: string) => `v2=${hex}`],
    ['uppercase hex', (hex: string) => `v1=${hex.toUpperCase()}`],
  ])('rejects a malformed signature header (%s)', async (_label, header) => {
    const request = await signedRequest({ signatureHeader: header });
    await expect(
      verifySignedRequest(request, secrets, NOW_MS),
    ).resolves.toEqual(UNAUTHORIZED);
  });

  it('rejects a non-numeric timestamp', async () => {
    const request = await signedRequest({ timestamp: `${NOW_S}.5` });
    await expect(
      verifySignedRequest(request, secrets, NOW_MS),
    ).resolves.toEqual(UNAUTHORIZED);
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

  describe('body cap', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('rejects a declared oversized body without reading it', async () => {
      const { stream, state } = trackedStream([new Uint8Array(16)]);
      const request = streamedRequest(stream, {
        ...(await signedHeaders(BODY)),
        'content-length': String(JOBS_SIGNED_BODY_MAX_BYTES + 1),
      });

      await expect(
        verifySignedRequest(request, secrets, NOW_MS),
      ).resolves.toEqual(BODY_TOO_LARGE);
      expect(state.pulls).toBe(0);
    });

    it('rejects an undeclared stream once it passes the cap and cancels it', async () => {
      const chunk = new Uint8Array(64 * 1024);
      const { stream, state } = trackedStream(
        Array.from({ length: 8 }, () => chunk),
      );
      const request = streamedRequest(stream, await signedHeaders(BODY));

      await expect(
        verifySignedRequest(request, secrets, NOW_MS),
      ).resolves.toEqual(BODY_TOO_LARGE);
      expect(state.cancelled).toBe(true);
      // 4 chunks reach the cap; the 5th passes it. The rest are never read.
      expect(state.pulls).toBe(5);
    });

    it('accepts a valid body of exactly the cap', async () => {
      const body = 'x'.repeat(JOBS_SIGNED_BODY_MAX_BYTES);
      const request = new Request(`${URL_BASE}${PATH}`, {
        method: 'POST',
        headers: await signedHeaders(body),
        body,
      });

      await expect(
        verifySignedRequest(request, secrets, NOW_MS),
      ).resolves.toEqual({ ok: true, body });
    });

    it('decodes multi-byte characters split across chunks', async () => {
      const body = JSON.stringify({ v: 1, topic: 'caf\u00e9 ✓' });
      const bytes = new TextEncoder().encode(body);
      const split = bytes.indexOf(0xe2) + 1; // inside the 3-byte check mark
      const { stream } = trackedStream([
        bytes.slice(0, split),
        bytes.slice(split),
      ]);
      const request = streamedRequest(stream, await signedHeaders(body));

      await expect(
        verifySignedRequest(request, secrets, NOW_MS),
      ).resolves.toEqual({ ok: true, body });
    });

    it('hashes the body once while checking both rotation secrets', async () => {
      const request = await signedRequest({ secret: PREVIOUS });
      const bodyLength = new TextEncoder().encode(BODY).byteLength;
      const digest = vi.spyOn(crypto.subtle, 'digest');

      await expect(
        verifySignedRequest(
          request,
          {
            JOBS_SIGNING_SECRET: SECRET,
            JOBS_SIGNING_SECRET_PREVIOUS: PREVIOUS,
          },
          NOW_MS,
        ),
      ).resolves.toEqual({ ok: true, body: BODY });
      const bodyDigests = digest.mock.calls.filter(
        ([, data]) => (data as Uint8Array).byteLength === bodyLength,
      );
      expect(bodyDigests).toHaveLength(1);
    });

    it('maps an oversized body to 413 and other failures to 401', () => {
      expect(
        signatureFailureResponse({ ok: false, reason: 'body_too_large' })
          .status,
      ).toBe(413);
      expect(
        signatureFailureResponse({ ok: false, reason: 'unauthorized' }).status,
      ).toBe(401);
    });

    it('leaves room for the largest plan-generation command', () => {
      // Control characters are the worst case: 6 JSON bytes per character.
      const worst = (length: number) => '\u0001'.repeat(length);
      const id = '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c';
      const long = 'm'.repeat(256);
      const command = planGenerationStartCommandSchema.parse({
        v: 1,
        planId: id,
        userId: id,
        tier: 'pro',
        input: {
          topic: worst(TOPIC_MAX_LENGTH),
          notes: worst(NOTES_MAX_LENGTH),
          skillLevel: 'beginner',
          weeklyHours: 40,
          learningStyle: 'mixed',
          startDate: '2026-11-13',
          deadlineDate: '2027-11-13',
        },
        modelOverride: long,
        groundedWriterModelId: long,
        correlationId: long,
        reservation: {
          attemptId: id,
          attemptNumber: 3,
          startedAt: '2026-11-13T00:00:00.000Z',
          admittedTier: 'pro',
          promptHash: 'h'.repeat(64),
          sanitized: {
            topic: {
              value: worst(TOPIC_MAX_LENGTH),
              truncated: false,
              originalLength: TOPIC_MAX_LENGTH,
            },
            notes: {
              value: worst(NOTES_MAX_LENGTH),
              truncated: false,
              originalLength: NOTES_MAX_LENGTH,
            },
          },
          generationPurpose: 'initial',
        },
        allowedGenerationStatuses: ['generating', 'failed'],
        requiredGenerationStatus: 'generating',
      });
      const bytes = new TextEncoder().encode(
        JSON.stringify(command),
      ).byteLength;

      expect(bytes).toBeLessThan(JOBS_SIGNED_BODY_MAX_BYTES / 4);
    });
  });
});
