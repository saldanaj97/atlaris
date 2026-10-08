import type { JobsWorkerCommandResult } from '@/lib/jobs-worker/client';

import { dispatchModuleLessonsToWorker } from '@/features/jobs/module-lessons-dispatch';
import { sendJobsWorkerCommand } from '@/lib/jobs-worker/client';
import { describe, expect, it, vi } from 'vitest';

const input = {
  planId: 'plan-1',
  moduleId: 'module-1',
  userId: 'user-1',
  batchRequestId: 'corr-1',
  correlationId: 'corr-1',
};
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

describe('dispatchModuleLessonsToWorker', () => {
  it('sends the v1 start command and returns the new instance ID', async () => {
    const send = sendReturning({
      kind: 'accepted',
      status: 202,
      body: { accepted: true, instanceId: 'lessons-module-1-corr-1' },
    });
    const log = makeLog();

    const result = await dispatchModuleLessonsToWorker(
      { ...input, modelOverride: 'openrouter/model' },
      { send, config, log },
    );

    expect(result).toEqual({
      kind: 'accepted',
      instanceId: 'lessons-module-1-corr-1',
    });
    expect(send).toHaveBeenCalledWith(
      '/v1/module-lessons/start',
      { v: 1, ...input, modelOverride: 'openrouter/model' },
      { config: config() },
    );
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('omits modelOverride when there is none', async () => {
    const send = sendReturning({
      kind: 'accepted',
      status: 202,
      body: { accepted: true, instanceId: 'lessons-module-1-corr-1' },
    });

    await dispatchModuleLessonsToWorker(input, {
      send,
      config,
      log: makeLog(),
    });

    expect(send.mock.calls[0]?.[1]).not.toHaveProperty('modelOverride');
  });

  it('returns duplicate when the instance already exists', async () => {
    const result = await dispatchModuleLessonsToWorker(input, {
      send: sendReturning({
        kind: 'accepted',
        status: 200,
        body: { accepted: true, duplicate: true },
      }),
      config,
      log: makeLog(),
    });

    expect(result).toEqual({ kind: 'duplicate' });
  });

  it.each(['jobs_paused', 'job_disabled'] as const)(
    'returns disabled for 503 %s',
    async (code) => {
      const log = makeLog();

      const result = await dispatchModuleLessonsToWorker(input, {
        send: sendReturning({ kind: 'rejected', status: 503, code }),
        config,
        log,
      });

      expect(result).toEqual({ kind: 'disabled', code });
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ moduleId: 'module-1', status: 503, code }),
        expect.any(String),
      );
    },
  );

  it.each([
    [{ kind: 'rejected', status: 503, code: 'workflow_start_failed' }],
    [{ kind: 'rejected', status: 400, code: undefined }],
    [{ kind: 'rejected', status: 401, code: undefined }],
    [{ kind: 'unavailable', reason: 'timeout' }],
    [{ kind: 'unavailable', reason: 'network' }],
  ] satisfies [JobsWorkerCommandResult][])(
    'returns failed for %j',
    async (sendResult) => {
      const log = makeLog();

      const result = await dispatchModuleLessonsToWorker(input, {
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

    const result = await dispatchModuleLessonsToWorker(input, {
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
      dispatchModuleLessonsToWorker(input, {
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
