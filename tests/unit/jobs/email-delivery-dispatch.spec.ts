import type { JobsWorkerCommandResult } from '@/lib/jobs-worker/client';

import { dispatchEmailDeliveryToWorker } from '@/features/jobs/email-delivery-dispatch';
import { sendJobsWorkerCommand } from '@/lib/jobs-worker/client';
import { describe, expect, it, vi } from 'vitest';

const input = {
  runKind: 'daily',
  schedulerDateUtc: '2026-07-10',
  action: 'start',
} as const;
const config = () => ({
  url: 'https://workers-staging.atlaris.app',
  signingSecret: 'secret',
});

function makeLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function sendReturning(result: JobsWorkerCommandResult) {
  return vi.fn<typeof sendJobsWorkerCommand>(async () => result);
}

describe('dispatchEmailDeliveryToWorker', () => {
  it('sends the v1 run command and reports a started run', async () => {
    const send = sendReturning({
      kind: 'accepted',
      status: 202,
      body: { accepted: true, instanceId: 'email-run-1-1', runId: 'run-1' },
    });
    const log = makeLog();

    const result = await dispatchEmailDeliveryToWorker(input, {
      send,
      config,
      log,
    });

    expect(result).toEqual({
      kind: 'accepted',
      outcome: 'started',
      runId: 'run-1',
      instanceId: 'email-run-1-1',
    });
    expect(send).toHaveBeenCalledWith(
      '/v1/email-delivery/runs',
      { v: 1, ...input },
      { config: config() },
    );
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each([
    ['completed', 'already_completed'],
    ['paused', 'already_paused'],
    ['failed', 'failed_requires_resume'],
    ['needs_review', 'needs_review'],
    ['running', 'already_running'],
    ['queued', 'already_running'],
  ] as const)(
    'maps an existing %s run to %s',
    async (status, expectedOutcome) => {
      const result = await dispatchEmailDeliveryToWorker(input, {
        send: sendReturning({
          kind: 'accepted',
          status: 200,
          body: { accepted: true, duplicate: true, runId: 'run-1', status },
        }),
        config,
        log: makeLog(),
      });

      expect(result).toEqual({
        kind: 'accepted',
        outcome: expectedOutcome,
        runId: 'run-1',
        instanceId: null,
      });
    },
  );

  it('treats an existing instance as an already running run', async () => {
    const result = await dispatchEmailDeliveryToWorker(input, {
      send: sendReturning({
        kind: 'accepted',
        status: 200,
        body: {
          accepted: true,
          duplicate: true,
          runId: 'run-1',
          instanceId: 'email-run-1-1',
        },
      }),
      config,
      log: makeLog(),
    });

    expect(result).toEqual({
      kind: 'accepted',
      outcome: 'already_running',
      runId: 'run-1',
      instanceId: 'email-run-1-1',
    });
  });

  it('returns invalid_run_state for a 409 invalid_run_state', async () => {
    const result = await dispatchEmailDeliveryToWorker(
      { ...input, action: 'resume' },
      {
        send: sendReturning({
          kind: 'rejected',
          status: 409,
          code: 'invalid_run_state',
        }),
        config,
        log: makeLog(),
      },
    );

    expect(result).toEqual({ kind: 'invalid_run_state' });
  });

  it.each(['jobs_paused', 'job_disabled'] as const)(
    'returns disabled for 503 %s',
    async (code) => {
      const result = await dispatchEmailDeliveryToWorker(input, {
        send: sendReturning({ kind: 'rejected', status: 503, code }),
        config,
        log: makeLog(),
      });

      expect(result).toEqual({ kind: 'disabled', code });
    },
  );

  it.each([
    [{ kind: 'rejected', status: 503, code: 'workflow_start_failed' }],
    [{ kind: 'rejected', status: 400, code: undefined }],
    [{ kind: 'rejected', status: 401, code: undefined }],
    [{ kind: 'rejected', status: 409, code: 'other' }],
    [{ kind: 'unavailable', reason: 'timeout' }],
    [{ kind: 'unavailable', reason: 'network' }],
  ] satisfies [JobsWorkerCommandResult][])(
    'returns failed for %j',
    async (sendResult) => {
      const log = makeLog();

      const result = await dispatchEmailDeliveryToWorker(input, {
        send: sendReturning(sendResult),
        config,
        log,
      });

      expect(result).toEqual({ kind: 'failed' });
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: sendResult.kind }),
        expect.any(String),
      );
    },
  );

  it('returns failed without sending when the Worker is not configured', async () => {
    const fetchSpy = vi.fn();

    const result = await dispatchEmailDeliveryToWorker(input, {
      send: (path, payload, clientDeps) =>
        sendJobsWorkerCommand(path, payload, {
          ...clientDeps,
          fetch: fetchSpy,
        }),
      config: () => ({ url: undefined, signingSecret: undefined }),
      log: makeLog(),
    });

    expect(result).toEqual({ kind: 'failed' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never throws, even when configuration is invalid', async () => {
    const log = makeLog();

    await expect(
      dispatchEmailDeliveryToWorker(input, {
        send: vi.fn(),
        config: () => {
          throw new Error('JOBS_WORKER_URL must be an absolute URL');
        },
        log,
      }),
    ).resolves.toEqual({ kind: 'failed' });
    expect(log.error).toHaveBeenCalledTimes(1);
  });
});
