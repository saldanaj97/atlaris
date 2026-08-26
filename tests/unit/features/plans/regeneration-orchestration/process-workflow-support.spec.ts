import type { Job } from '@/features/jobs/types';
import type { GenerationAttemptResult } from '@/features/plans/lifecycle/types';
import type { RegenerationPlanRow } from '@/features/plans/regeneration-orchestration/process-workflow-support';
import type { PlanRegenerationJobPayload } from '@/features/plans/regeneration-orchestration/schema';

import { JOB_TYPES } from '@/features/jobs/types';
import {
  applyRegenerationGenerationResult,
  buildRegenerationGenerationInput,
  validateQueuedRegenerationPayload,
} from '@/features/plans/regeneration-orchestration/process-workflow-support';
import { makeRegenerationOrchestrationDeps } from '@tests/helpers/regeneration-orchestration-deps';
import { describe, expect, it, vi } from 'vitest';

const plan = {
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  userId: 'user-1',
  topic: 'stored topic',
  skillLevel: 'beginner',
  weeklyHours: 5,
  learningStyle: 'mixed',
  startDate: '2026-01-01',
  deadlineDate: '2026-06-01',
} as unknown as RegenerationPlanRow;

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    type: JOB_TYPES.PLAN_REGENERATION,
    planId: plan.id,
    userId: plan.userId,
    status: 'processing',
    priority: 0,
    attempts: 0,
    maxAttempts: 3,
    data: { planId: plan.id },
    result: null,
    error: null,
    processingStartedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('buildRegenerationGenerationInput', () => {
  it('rebuilds topic from the persisted plan and ignores date nulls', () => {
    const payload = {
      planId: plan.id,
      overrides: { startDate: null, deadlineDate: null, topic: 'new topic' },
    } as PlanRegenerationJobPayload;

    expect(buildRegenerationGenerationInput(payload, plan)).toMatchObject({
      topic: 'stored topic',
      notes: undefined,
      startDate: undefined,
      deadlineDate: undefined,
    });
  });

  it('drops invalid stored dates and never uses override notes', () => {
    const payload = {
      planId: plan.id,
      overrides: { notes: 'Keep this focus.' },
    } as PlanRegenerationJobPayload;
    const planWithInvalidDates = {
      ...plan,
      startDate: '2026-02-30',
      deadlineDate: 'not-a-date',
    } as RegenerationPlanRow;

    expect(
      buildRegenerationGenerationInput(payload, planWithInvalidDates),
    ).toMatchObject({
      notes: undefined,
      startDate: undefined,
      deadlineDate: undefined,
      topic: 'stored topic',
    });
  });
});

describe('validateQueuedRegenerationPayload', () => {
  it('fails closed when a legacy payload still carries topic or notes', async () => {
    const failJob = vi.fn(async () => null);
    const deps = makeRegenerationOrchestrationDeps({ queue: { failJob } });
    const job = makeJob({
      data: {
        planId: plan.id,
        overrides: { topic: 'forged topic' },
      } as unknown as Job['data'],
    });

    await expect(validateQueuedRegenerationPayload(job, deps)).resolves.toEqual(
      {
        ok: false,
        result: { kind: 'invalid-payload', jobId: job.id },
      },
    );
    expect(failJob).toHaveBeenCalledWith(
      job.id,
      'Queued regeneration overrides cannot change topic or notes.',
      { retryable: false },
    );
  });
});

describe('applyRegenerationGenerationResult', () => {
  it('completes the job with generated module and task counts', async () => {
    const completeJob = vi.fn(async () => null);
    const deps = makeRegenerationOrchestrationDeps({ queue: { completeJob } });
    const job = makeJob();
    const result = {
      status: 'generation_success',
      data: {
        modules: [
          {
            title: 'Module one',
            estimatedMinutes: 30,
            tasks: [
              { title: 'Task one', estimatedMinutes: 10 },
              { title: 'Task two', estimatedMinutes: 20 },
            ],
          },
          {
            title: 'Module two',
            estimatedMinutes: 15,
            tasks: [],
          },
        ],
        metadata: {},
        durationMs: 42,
      },
    } satisfies GenerationAttemptResult;

    await expect(
      applyRegenerationGenerationResult({ job, plan }, result, deps),
    ).resolves.toEqual({ kind: 'completed', jobId: job.id, planId: plan.id });
    expect(completeJob).toHaveBeenCalledWith(job.id, {
      planId: plan.id,
      modulesCount: 2,
      tasksCount: 2,
      durationMs: 42,
    });
  });

  it.each([
    { status: 'pending' as const, willRetry: true },
    { status: 'failed' as const, willRetry: false },
  ])(
    'returns willRetry=$willRetry when the queue row is $status',
    async ({ status, willRetry }) => {
      const failedJob = makeJob({ status });
      const failJob = vi.fn(async () => failedJob);
      const deps = makeRegenerationOrchestrationDeps({ queue: { failJob } });
      const job = makeJob();
      const result = {
        status: 'retryable_failure',
        classification: 'timeout',
        error: new Error('provider timeout'),
      } satisfies GenerationAttemptResult;

      await expect(
        applyRegenerationGenerationResult({ job, plan }, result, deps),
      ).resolves.toEqual({
        kind: 'retryable-failure',
        jobId: job.id,
        planId: plan.id,
        willRetry,
      });
      expect(failJob).toHaveBeenCalledWith(
        job.id,
        'Plan regeneration failed (timeout).',
        { retryable: true },
      );
    },
  );

  it('terminalizes permanent generation failures non-retryably', async () => {
    const failJob = vi.fn(async () => null);
    const deps = makeRegenerationOrchestrationDeps({ queue: { failJob } });
    const job = makeJob();
    const result = {
      status: 'permanent_failure',
      classification: 'validation',
      error: new Error('invalid generation'),
    } satisfies GenerationAttemptResult;

    await expect(
      applyRegenerationGenerationResult({ job, plan }, result, deps),
    ).resolves.toEqual({
      kind: 'permanent-failure',
      jobId: job.id,
      planId: plan.id,
    });
    expect(failJob).toHaveBeenCalledWith(
      job.id,
      'Plan regeneration failed (validation).',
      { retryable: false },
    );
  });

  it('completes an already-finalized plan idempotently', async () => {
    const completeJob = vi.fn(async () => null);
    const deps = makeRegenerationOrchestrationDeps({ queue: { completeJob } });
    const job = makeJob();
    const result = {
      status: 'already_finalized',
      planId: plan.id,
    } satisfies GenerationAttemptResult;

    await expect(
      applyRegenerationGenerationResult({ job, plan }, result, deps),
    ).resolves.toEqual({
      kind: 'already-finalized',
      jobId: job.id,
      planId: plan.id,
    });
    expect(completeJob).toHaveBeenCalledWith(job.id, {
      planId: plan.id,
      modulesCount: 0,
      tasksCount: 0,
      durationMs: 0,
    });
  });
});
