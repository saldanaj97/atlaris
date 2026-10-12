import type { PlanGenerationWorkflowInput } from '@/features/plans/workflows/plan-generation.types';
import type { JobsWorkerCommandResult } from '@/lib/jobs-worker/client';

import { dispatchPlanGenerationToWorker } from '@/features/jobs/plan-generation-dispatch';
import { toSerializableReservation } from '@/features/plans/workflows/plan-generation.types';
import { sendJobsWorkerCommand } from '@/lib/jobs-worker/client';
import { planGenerationStartCommandSchema } from '@/lib/jobs-worker/contract';
import { makeAttemptReservation } from '@tests/fixtures/attempts';
import { describe, expect, it, vi } from 'vitest';

const ATTEMPT_ID = '5a0d7b6c-1e9f-4d8a-8b3c-2f1a0b9c8d74';

const input: PlanGenerationWorkflowInput = {
  planId: '0b5e2c1d-6f4a-4e3b-9c8d-7a6b5c4d3e2f',
  userId: '2d7a4e3f-8b6c-4a5d-9e0f-9c8d7e6f5a41',
  tier: 'starter',
  input: {
    topic: 'TypeScript',
    skillLevel: 'intermediate',
    weeklyHours: 6,
    learningStyle: 'practice',
    startDate: '2026-10-12',
  },
  generationPurpose: 'initial',
  modelOverride: null,
  correlationId: 'req-1',
  reservation: toSerializableReservation(
    makeAttemptReservation({ attemptId: ATTEMPT_ID }),
  ),
  allowedGenerationStatuses: ['failed', 'pending_retry'],
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

describe('dispatchPlanGenerationToWorker', () => {
  it('sends a v1 start command the Worker accepts and returns the instance ID', async () => {
    const send = sendReturning({
      kind: 'accepted',
      status: 202,
      body: { accepted: true, instanceId: `plan-${ATTEMPT_ID}` },
    });
    const log = makeLog();

    const result = await dispatchPlanGenerationToWorker(input, {
      send,
      config,
      log,
    });

    expect(result).toEqual({
      kind: 'accepted',
      instanceId: `plan-${ATTEMPT_ID}`,
    });
    expect(send).toHaveBeenCalledWith(
      '/v1/plan-generation/start',
      { v: 1, ...input },
      { config: config() },
    );
    const body = JSON.parse(JSON.stringify(send.mock.calls[0]?.[1]));
    expect(planGenerationStartCommandSchema.safeParse(body).success).toBe(true);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('returns duplicate when the instance already exists', async () => {
    const result = await dispatchPlanGenerationToWorker(input, {
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

      const result = await dispatchPlanGenerationToWorker(input, {
        send: sendReturning({ kind: 'rejected', status: 503, code }),
        config,
        log,
      });

      expect(result).toEqual({ kind: 'disabled', code });
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          attemptId: ATTEMPT_ID,
          status: 503,
          code,
        }),
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

      const result = await dispatchPlanGenerationToWorker(input, {
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

    const result = await dispatchPlanGenerationToWorker(input, {
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
      dispatchPlanGenerationToWorker(input, {
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
