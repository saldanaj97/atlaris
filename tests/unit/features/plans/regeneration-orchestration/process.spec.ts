import type { Job } from '@/features/jobs/types';
import type { RegenerationOrchestrationDeps } from '@/features/plans/regeneration-orchestration/deps';
import type { DbClient } from '@/lib/db/types';

import { JOB_TYPES } from '@/features/jobs/types';
import { resetPlanRegenerationCancellationMarkersForTests } from '@/features/plans/cancel-plan-regeneration-workflow';
import {
  processNextPlanRegenerationJob,
  processPlanRegenerationJob,
} from '@/features/plans/regeneration-orchestration/process';
import {
  makeRegenerationOrchestrationDeps,
  type RegenerationOrchestrationDepsOverrides,
} from '@tests/helpers/regeneration-orchestration-deps';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const workflowStartMock = vi.hoisted(() => vi.fn());
const workflowGetRunMock = vi.hoisted(() => vi.fn());
const recordRegenerationWorkflowAttachUncertainMock = vi.hoisted(() => vi.fn());

vi.mock('workflow/api', () => ({
  getRun: workflowGetRunMock,
  start: workflowStartMock,
}));

vi.mock('@/lib/logging/ops-alerts', async (importOriginal) => ({
  ...(await importOriginal()),
  recordRegenerationWorkflowAttachUncertain:
    recordRegenerationWorkflowAttachUncertainMock,
}));

const planRow = {
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  userId: 'user-1',
  topic: 'topic',
  skillLevel: 'beginner' as const,
  weeklyHours: 5,
  learningStyle: 'mixed' as const,
  startDate: '2026-01-01',
  deadlineDate: '2026-06-01',
};

function makeJob(overrides: Partial<Job> & { data?: Job['data'] } = {}): Job {
  const planId =
    overrides.planId ??
    (overrides.data as { planId?: string } | undefined)?.planId ??
    planRow.id;
  return {
    id: 'job-1',
    type: JOB_TYPES.PLAN_REGENERATION,
    planId,
    userId: 'user-1',
    status: 'processing',
    priority: 0,
    attempts: 0,
    maxAttempts: 3,
    result: null,
    error: null,
    processingStartedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
    data: overrides.data ?? { planId },
  };
}

function buildProcessDeps(
  overrides: RegenerationOrchestrationDepsOverrides = {},
): RegenerationOrchestrationDeps {
  const findFirst = vi.fn(async () => planRow);
  return makeRegenerationOrchestrationDeps({
    ...overrides,
    dbClient:
      overrides.dbClient ??
      ({ query: { learningPlans: { findFirst } } } as unknown as DbClient),
  });
}

describe('processNextPlanRegenerationJob', () => {
  it('returns no-job when queue is empty', async () => {
    const deps = buildProcessDeps({
      queue: { getNextJob: vi.fn(async () => null) },
    });

    await expect(processNextPlanRegenerationJob(deps)).resolves.toEqual({
      kind: 'no-job',
    });
  });
});

describe('processPlanRegenerationJob', () => {
  beforeEach(() => {
    workflowStartMock.mockReset();
    workflowGetRunMock.mockReset();
    workflowGetRunMock.mockReturnValue({
      cancel: vi.fn(async () => undefined),
    });
    recordRegenerationWorkflowAttachUncertainMock.mockReset();
  });

  afterEach(() => {
    resetPlanRegenerationCancellationMarkersForTests();
  });

  it('terminalizes an invalid job payload without starting a workflow', async () => {
    const failJob = vi.fn(async () => null);
    const deps = buildProcessDeps({ queue: { failJob } });
    const job = makeJob({ data: { planId: 'not-a-uuid' } as Job['data'] });

    await expect(processPlanRegenerationJob(job, deps)).resolves.toEqual({
      kind: 'invalid-payload',
      jobId: job.id,
    });
    expect(failJob).toHaveBeenCalledWith(
      job.id,
      'Invalid plan regeneration job payload.',
      { retryable: false },
    );
    expect(workflowStartMock).not.toHaveBeenCalled();
  });

  it('terminalizes metadata mismatches without starting a workflow', async () => {
    const failJob = vi.fn(async () => null);
    const deps = buildProcessDeps({ queue: { failJob } });
    const job = makeJob({
      planId: planRow.id,
      data: { planId: '11111111-1111-4111-8111-111111111111' },
    });

    await expect(processPlanRegenerationJob(job, deps)).resolves.toEqual({
      kind: 'invalid-payload',
      jobId: job.id,
    });
    expect(failJob).toHaveBeenCalledWith(
      job.id,
      'Invalid plan regeneration job payload.',
      { retryable: false },
    );
    expect(workflowStartMock).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['owned by a different user', { ...planRow, userId: 'another-user' }],
  ])(
    'returns the non-enumerating terminal outcome when the plan is %s',
    async (_case, foundPlan) => {
      const failJob = vi.fn(async () => null);
      const findFirst = vi.fn(async () => foundPlan);
      const deps = buildProcessDeps({
        dbClient: {
          query: { learningPlans: { findFirst } },
        } as unknown as DbClient,
        queue: { failJob },
      });
      const job = makeJob();

      await expect(processPlanRegenerationJob(job, deps)).resolves.toEqual({
        kind: 'plan-not-found-or-unauthorized',
        jobId: job.id,
        planId: planRow.id,
      });
      expect(failJob).toHaveBeenCalledWith(
        job.id,
        'Plan not found for queued regeneration.',
        { retryable: false },
      );
      expect(workflowStartMock).not.toHaveBeenCalled();
    },
  );

  it('starts and persists a workflow without a workflow selector', async () => {
    workflowStartMock.mockResolvedValue({
      runId: 'wrun_drain',
      returnValue: Promise.resolve({ kind: 'completed' }),
    });
    const updateRegenerationJobPayload = vi.fn(
      async (_jobId: string, payload: Job['data']) =>
        ({
          id: job.id,
          data: payload,
        }) as Awaited<
          ReturnType<
            RegenerationOrchestrationDeps['queue']['updateRegenerationJobPayload']
          >
        >,
    );
    const deps = buildProcessDeps({
      queue: { updateRegenerationJobPayload },
    });
    const job = makeJob();

    await expect(processPlanRegenerationJob(job, deps)).resolves.toEqual({
      kind: 'workflow-in-flight',
      jobId: job.id,
      planId: planRow.id,
    });
    expect(workflowStartMock).toHaveBeenCalledTimes(1);
    expect(updateRegenerationJobPayload).toHaveBeenCalledWith(
      job.id,
      expect.objectContaining({
        workflow: expect.objectContaining({ runId: 'wrun_drain' }),
      }),
    );
  });

  it('keeps drain workflow startup failures retryable', async () => {
    workflowStartMock.mockRejectedValue(new Error('sdk-start-fail'));
    const failedQueueRow = makeJob({
      status: 'pending',
      attempts: 1,
      maxAttempts: 3,
    });
    const failJob = vi.fn(async () => failedQueueRow);
    const deps = buildProcessDeps({ queue: { failJob } });
    const job = makeJob();

    await expect(processPlanRegenerationJob(job, deps)).resolves.toEqual({
      kind: 'retryable-failure',
      jobId: job.id,
      planId: planRow.id,
      willRetry: true,
    });
    expect(failJob).toHaveBeenCalledWith(
      job.id,
      'Queued plan regeneration failed.',
      { retryable: true },
    );
  });

  it('terminalizes unexpected processing errors non-retryably', async () => {
    const findFirst = vi.fn(async () => {
      throw new Error('database unavailable');
    });
    const failJob = vi.fn(async () => null);
    const deps = buildProcessDeps({
      dbClient: {
        query: { learningPlans: { findFirst } },
      } as unknown as DbClient,
      queue: { failJob },
    });
    const job = makeJob();

    await expect(processPlanRegenerationJob(job, deps)).resolves.toEqual({
      kind: 'permanent-failure',
      jobId: job.id,
      planId: planRow.id,
    });
    expect(failJob).toHaveBeenCalledWith(
      job.id,
      'Queued plan regeneration failed.',
      { retryable: false },
    );
  });

  it('terminalizes a run-id persistence failure without an uncertainty alert after cancellation', async () => {
    workflowStartMock.mockResolvedValue({
      runId: 'wrun_persisted',
      returnValue: Promise.resolve({ kind: 'completed' }),
    });
    const persistError = new Error('run id write failed');
    const failJob = vi.fn(async () => null);
    const updateRegenerationJobPayload = vi.fn(async () => {
      throw persistError;
    });
    const deps = buildProcessDeps({
      queue: { failJob, updateRegenerationJobPayload },
    });
    const job = makeJob();

    await expect(processPlanRegenerationJob(job, deps)).resolves.toEqual({
      kind: 'permanent-failure',
      jobId: job.id,
      planId: planRow.id,
    });
    expect(failJob).toHaveBeenCalledWith(
      job.id,
      'Failed to persist plan regeneration workflow run id.',
      { retryable: false },
    );
    expect(
      recordRegenerationWorkflowAttachUncertainMock,
    ).not.toHaveBeenCalled();
  });

  it('alerts when a run-id persistence failure leaves workflow cancellation uncertain', async () => {
    workflowStartMock.mockResolvedValue({
      runId: 'wrun_uncertain',
      returnValue: Promise.resolve({ kind: 'completed' }),
    });
    const persistError = new Error('run id write failed');
    workflowGetRunMock.mockReturnValue({
      cancel: vi.fn(async () => {
        throw new Error('cancel failed');
      }),
    });
    const failJob = vi.fn(async () => null);
    const updateRegenerationJobPayload = vi.fn(async () => {
      throw persistError;
    });
    const deps = buildProcessDeps({
      queue: { failJob, updateRegenerationJobPayload },
    });
    const job = makeJob();

    await expect(processPlanRegenerationJob(job, deps)).resolves.toEqual({
      kind: 'permanent-failure',
      jobId: job.id,
      planId: planRow.id,
    });
    expect(failJob).toHaveBeenCalledWith(
      job.id,
      'Failed to persist plan regeneration workflow run id.',
      { retryable: false },
    );
    expect(recordRegenerationWorkflowAttachUncertainMock).toHaveBeenCalledWith(
      {
        jobId: job.id,
        planId: planRow.id,
        userId: job.userId,
        workflowRunId: 'wrun_uncertain',
        cancellationSucceeded: false,
      },
      persistError,
    );
  });
});
