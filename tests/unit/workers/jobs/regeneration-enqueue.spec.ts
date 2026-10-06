import {
  handleRegenerationEnqueue,
  type RegenerationEnqueueDeps,
} from '../../../../workers/jobs/src/jobs/regeneration-enqueue';
import {
  computeJobsSignature,
  JOBS_SIGNATURE_HEADER,
  JOBS_TIMESTAMP_HEADER,
} from '@/lib/jobs-worker/contract';
import { describe, expect, it, vi } from 'vitest';

const SECRET = 'current-secret-0123456789abcdef0123456789';
const NOW_MS = 1_790_000_000_000;
const PATH = '/v1/regeneration/enqueue';
const JOB_ID = '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c';

async function signed(body: string, secret = SECRET): Promise<Request> {
  const timestamp = String(NOW_MS / 1000);
  const hex = await computeJobsSignature({
    secret,
    timestamp,
    method: 'POST',
    path: PATH,
    body,
  });
  return new Request(`https://workers-staging.atlaris.app${PATH}`, {
    method: 'POST',
    headers: {
      [JOBS_TIMESTAMP_HEADER]: timestamp,
      [JOBS_SIGNATURE_HEADER]: `v1=${hex}`,
    },
    body,
  });
}

function makeDeps(env: Record<string, string> = {}) {
  const send = vi.fn(async () => ({
    metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
  }));
  const captureException = vi.fn();
  const logger = { info: vi.fn(), warn: vi.fn() };
  const deps: RegenerationEnqueueDeps = {
    env: {
      JOBS_SIGNING_SECRET: SECRET,
      JOB_REGENERATION_ENABLED: 'true',
      ...env,
    },
    queue: { send },
    logger,
    captureException,
    nowMs: NOW_MS,
  };
  return { deps, send, captureException };
}

const validBody = JSON.stringify({ v: 1, jobId: JOB_ID });

describe('handleRegenerationEnqueue', () => {
  it('puts { v: 1, jobId } on the queue and answers 202', async () => {
    const { deps, send } = makeDeps();

    const response = await handleRegenerationEnqueue(
      await signed(validBody),
      deps,
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      jobId: JOB_ID,
    });
    expect(send).toHaveBeenCalledWith({ v: 1, jobId: JOB_ID });
  });

  it('drops unknown body fields before queueing', async () => {
    const { deps, send } = makeDeps();
    const body = JSON.stringify({ v: 1, jobId: JOB_ID, extra: 'x' });

    await handleRegenerationEnqueue(await signed(body), deps);

    expect(send).toHaveBeenCalledWith({ v: 1, jobId: JOB_ID });
  });

  it('answers 401 with no body for a bad signature, even while paused', async () => {
    const { deps, send } = makeDeps({ JOBS_PAUSED: 'true' });

    const response = await handleRegenerationEnqueue(
      await signed(validBody, 'wrong-secret'),
      deps,
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe('');
    expect(send).not.toHaveBeenCalled();
  });

  it('answers 503 jobs_paused while jobs are paused', async () => {
    const { deps, send } = makeDeps({ JOBS_PAUSED: 'true' });

    const response = await handleRegenerationEnqueue(
      await signed(validBody),
      deps,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code: 'jobs_paused' });
    expect(send).not.toHaveBeenCalled();
  });

  it('answers 503 job_disabled when the switch is absent', async () => {
    const { deps, send } = makeDeps({ JOB_REGENERATION_ENABLED: '' });

    const response = await handleRegenerationEnqueue(
      await signed(validBody),
      deps,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code: 'job_disabled' });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['not JSON', 'nope'],
    ['wrong version', JSON.stringify({ v: 2, jobId: JOB_ID })],
    ['non-uuid job', JSON.stringify({ v: 1, jobId: 'job-1' })],
  ])('answers 400 for an invalid body (%s)', async (_label, body) => {
    const { deps, send } = makeDeps();

    const response = await handleRegenerationEnqueue(await signed(body), deps);

    expect(response.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it('answers 500 and reports to Sentry when the queue send fails', async () => {
    const { deps, send, captureException } = makeDeps();
    const failure = new Error('queue unavailable');
    send.mockRejectedValueOnce(failure);

    const response = await handleRegenerationEnqueue(
      await signed(validBody),
      deps,
    );

    expect(response.status).toBe(500);
    expect(captureException).toHaveBeenCalledWith(failure, {
      tags: { job: 'regeneration', runtime: 'cloudflare-worker' },
      extra: { jobId: JOB_ID },
    });
  });
});
