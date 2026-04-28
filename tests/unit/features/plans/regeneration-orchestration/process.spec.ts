import { describe, expect, it, vi } from 'vitest';

import type { Job } from '@/features/jobs/types';
import { JOB_TYPES } from '@/features/jobs/types';
import type { RegenerationOrchestrationDeps } from '@/features/plans/regeneration-orchestration/deps';
import {
  processNextPlanRegenerationJob,
  processPlanRegenerationJob,
} from '@/features/plans/regeneration-orchestration/process';
import type { DbClient } from '@/lib/db/types';

type ProcessDepsOverrides = {
  [K in keyof RegenerationOrchestrationDeps]?: K extends 'queue'
    ? Partial<RegenerationOrchestrationDeps['queue']>
    : RegenerationOrchestrationDeps[K];
};

const planRow = {
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  userId: 'user-1',
  topic: 'topic',
  skillLevel: 'beginner' as const,
  weeklyHours: 5,
  learningStyle: 'mixed' as const,
  startDate: '2026-01-01',
  deadlineDate: '2026-06-01',
  visibility: 'private',
  origin: 'ai' as const,
  generationStatus: 'ready' as const,
  isQuotaEligible: true,
  finalizedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeLifecycleServiceMock(
  processGenerationAttempt: RegenerationOrchestrationDeps['lifecycle']['service']['processGenerationAttempt'] = vi.fn(),
): RegenerationOrchestrationDeps['lifecycle']['service'] {
  return {
    processGenerationAttempt,
  } as unknown as RegenerationOrchestrationDeps['lifecycle']['service'];
}

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
  overrides: ProcessDepsOverrides = {},
): RegenerationOrchestrationDeps {
  const findFirst = vi.fn(async () => planRow);
  const base: RegenerationOrchestrationDeps = {
    dbClient: {
      query: { learningPlans: { findFirst } },
    } as unknown as DbClient,
    queue: {
      enabled: vi.fn(() => true),
      enqueueWithResult: vi.fn(),
      getNextJob: vi.fn(),
      completeJob: vi.fn(async () => null),
      failJob: vi.fn(async () => null),
    },
    quota: { runReserved: vi.fn() },
    plans: {
      getActiveRegenerationJob: vi.fn(),
      findOwnedPlan: vi.fn(),
    },
    tier: {
      resolveUserTier: vi.fn(async () => 'pro' as const),
    },
    priority: {
      computeJobPriority: vi.fn(),
      isPriorityTopic: vi.fn(),
    },
    lifecycle: {
      service: makeLifecycleServiceMock(),
    },
    retry: {
      shouldRetryJob: vi.fn(() => ({
        shouldRetry: true,
        reason: 'retry',
      })),
    },
    inlineDrain: {
      tryRegister: vi.fn(),
      drain: vi.fn(),
    },
    rateLimit: { check: vi.fn() },
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
  };

  return {
    ...base,
    dbClient: (overrides.dbClient ?? base.dbClient) as DbClient,
    queue: { ...base.queue, ...overrides.queue },
    quota: { ...base.quota, ...overrides.quota },
    plans: { ...base.plans, ...overrides.plans },
    tier: { ...base.tier, ...overrides.tier },
    priority: { ...base.priority, ...overrides.priority },
    lifecycle: { ...base.lifecycle, ...overrides.lifecycle },
    retry: { ...base.retry, ...overrides.retry },
    inlineDrain: { ...base.inlineDrain, ...overrides.inlineDrain },
    rateLimit: { ...base.rateLimit, ...overrides.rateLimit },
    logger: { ...base.logger, ...overrides.logger },
  };
}

describe('processNextPlanRegenerationJob', () => {
  it('returns no-job when queue is empty', async () => {
    const deps = buildProcessDeps({
      queue: { getNextJob: vi.fn(async () => null) },
    });
    const result = await processNextPlanRegenerationJob(deps);
    expect(result).toEqual({ kind: 'no-job' });
  });
});

describe('processPlanRegenerationJob', () => {
  it('returns invalid-payload and failJob non-retryable when schema fails', async () => {
    const failJob = vi.fn(async () => null);
    const deps = buildProcessDeps({
      queue: { failJob },
    });
    const job = makeJob({ data: { planId: 'not-a-uuid' } as Job['data'] });
    const result = await processPlanRegenerationJob(job, deps);
    expect(result).toEqual({ kind: 'invalid-payload', jobId: job.id });
    expect(failJob).toHaveBeenCalledWith(
      job.id,
      'Invalid plan regeneration job payload.',
      { retryable: false },
    );
  });

  it('returns plan-not-found-or-unauthorized when plan row missing', async () => {
    const findFirst = vi.fn(async () => undefined);
    const failJob = vi.fn(async () => null);
    const deps = buildProcessDeps({
      dbClient: {
        query: { learningPlans: { findFirst } },
      } as unknown as DbClient,
      queue: { failJob },
    });
    const job = makeJob();
    const result = await processPlanRegenerationJob(job, deps);
    expect(result.kind).toBe('plan-not-found-or-unauthorized');
    expect(failJob).toHaveBeenCalledWith(
      job.id,
      'Plan not found for queued regeneration.',
      { retryable: false },
    );
  });

  it('rejects job metadata that disagrees with payload plan id', async () => {
    const failJob = vi.fn(async () => null);
    const deps = buildProcessDeps({
      queue: { failJob },
    });
    const payloadPlanId = '11111111-1111-4111-8111-111111111111';
    const job = makeJob({
      planId: planRow.id,
      data: { planId: payloadPlanId },
    });
    const result = await processPlanRegenerationJob(job, deps);
    expect(result).toEqual({ kind: 'invalid-payload', jobId: job.id });
    expect(failJob).toHaveBeenCalledWith(
      job.id,
      'Invalid plan regeneration job payload.',
      { retryable: false },
    );
    expect(deps.logger.error).toHaveBeenCalledWith(
      {
        jobId: job.id,
        jobPlanId: planRow.id,
        payloadPlanId,
      },
      'Queued plan regeneration job metadata mismatch',
    );
  });

  it('returns same outcome and message when plan owned by different user', async () => {
    const findFirst = vi.fn(async () => ({
      ...planRow,
      userId: 'someone-else',
    }));
    const failJob = vi.fn(async () => null);
    const deps = buildProcessDeps({
      dbClient: {
        query: { learningPlans: { findFirst } },
      } as unknown as DbClient,
      queue: { failJob },
    });
    const job = makeJob();
    const result = await processPlanRegenerationJob(job, deps);
    expect(result.kind).toBe('plan-not-found-or-unauthorized');
    expect(failJob).toHaveBeenCalledWith(
      job.id,
      'Plan not found for queued regeneration.',
      { retryable: false },
    );
  });

  it('passes explicit null override dates as clearing inputs', async () => {
    const processAttempt = vi.fn().mockResolvedValue({
      status: 'generation_success',
      data: {
        modules: [],
        durationMs: 0,
      },
    });
    const deps = buildProcessDeps({
      lifecycle: {
        service: makeLifecycleServiceMock(processAttempt),
      },
    });
    const job = makeJob({
      data: {
        planId: planRow.id,
        overrides: { startDate: null, deadlineDate: null },
      },
    });
    await processPlanRegenerationJob(job, deps);
    expect(processAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          startDate: undefined,
          deadlineDate: undefined,
        }),
      }),
    );
  });

  it('preserves notes semantics when overrides omit notes', async () => {
    const processAttempt = vi.fn().mockResolvedValue({
      status: 'generation_success',
      data: { modules: [], durationMs: 0 },
    });
    const deps = buildProcessDeps({
      lifecycle: {
        service: makeLifecycleServiceMock(processAttempt),
      },
    });
    const job = makeJob({
      data: { planId: planRow.id, overrides: { topic: 'abc' } },
    });
    await processPlanRegenerationJob(job, deps);
    expect(processAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ notes: undefined }),
      }),
    );
  });

  it('passes string notes through to generation input', async () => {
    const processAttempt = vi.fn().mockResolvedValue({
      status: 'generation_success',
      data: { modules: [], durationMs: 0 },
    });
    const deps = buildProcessDeps({
      lifecycle: {
        service: makeLifecycleServiceMock(processAttempt),
      },
    });
    const job = makeJob({
      data: {
        planId: planRow.id,
        overrides: { notes: 'keep me' },
      },
    });
    await processPlanRegenerationJob(job, deps);
    expect(processAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ notes: 'keep me' }),
      }),
    );
  });

  it('completes job on generation_success with module and task counts', async () => {
    const completeJob = vi.fn(async () => null);
    const processAttempt = vi.fn().mockResolvedValue({
      status: 'generation_success',
      data: {
        modules: [
          { tasks: [{ id: 't1' }, { id: 't2' }] },
          { tasks: [{ id: 't3' }] },
        ],
        durationMs: 42,
      },
    });
    const deps = buildProcessDeps({
      queue: { completeJob },
      lifecycle: {
        service: makeLifecycleServiceMock(processAttempt),
      },
    });
    const job = makeJob();
    const result = await processPlanRegenerationJob(job, deps);
    expect(result).toEqual({
      kind: 'completed',
      jobId: job.id,
      planId: planRow.id,
    });
    expect(completeJob).toHaveBeenCalledWith(job.id, {
      planId: planRow.id,
      modulesCount: 2,
      tasksCount: 3,
      durationMs: 42,
    });
  });

  it('retryable_failure with attempts left fails retryable and logs', async () => {
    const failJob = vi.fn(async () => null);
    const processAttempt = vi.fn().mockResolvedValue({
      status: 'retryable_failure',
      classification: 'timeout',
      error: new Error('boom'),
    });
    const deps = buildProcessDeps({
      queue: { failJob },
      retry: {
        shouldRetryJob: vi.fn(() => ({
          shouldRetry: true,
          reason: 'Retryable — attempt 1/3',
        })),
      },
      lifecycle: {
        service: makeLifecycleServiceMock(processAttempt),
      },
    });
    const job = makeJob({ attempts: 0, maxAttempts: 3 });
    const result = await processPlanRegenerationJob(job, deps);
    expect(result).toEqual({
      kind: 'retryable-failure',
      jobId: job.id,
      planId: planRow.id,
      willRetry: true,
    });
    expect(failJob).toHaveBeenCalledWith(
      job.id,
      'Plan regeneration failed (timeout).',
      { retryable: true },
    );
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        classification: 'timeout',
        retryDecision: 'Retryable — attempt 1/3',
        error: expect.any(Error),
      }),
      'Regeneration job retryable failure — retry decision applied',
    );
  });

  it('retryable_failure at cap fails non-retryable', async () => {
    const failJob = vi.fn(async () => null);
    const processAttempt = vi.fn().mockResolvedValue({
      status: 'retryable_failure',
      classification: 'timeout',
      error: new Error('boom'),
    });
    const deps = buildProcessDeps({
      queue: { failJob },
      retry: {
        shouldRetryJob: vi.fn(() => ({
          shouldRetry: false,
          reason: 'Attempt cap reached (3/3)',
        })),
      },
      lifecycle: {
        service: makeLifecycleServiceMock(processAttempt),
      },
    });
    const job = makeJob({ attempts: 2, maxAttempts: 3 });
    const result = await processPlanRegenerationJob(job, deps);
    expect(result).toMatchObject({
      kind: 'retryable-failure',
      willRetry: false,
    });
    expect(failJob).toHaveBeenCalledWith(
      job.id,
      'Plan regeneration failed (timeout).',
      { retryable: false },
    );
  });

  it('permanent_failure fails non-retryable', async () => {
    const failJob = vi.fn(async () => null);
    const processAttempt = vi.fn().mockResolvedValue({
      status: 'permanent_failure',
      classification: 'bad_request',
      error: new Error('nope'),
    });
    const deps = buildProcessDeps({
      queue: { failJob },
      lifecycle: {
        service: makeLifecycleServiceMock(processAttempt),
      },
    });
    const job = makeJob();
    const result = await processPlanRegenerationJob(job, deps);
    expect(result).toMatchObject({
      kind: 'permanent-failure',
      jobId: job.id,
      planId: planRow.id,
    });
    expect(failJob).toHaveBeenCalledWith(
      job.id,
      'Plan regeneration failed (bad_request).',
      { retryable: false },
    );
    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        classification: 'bad_request',
        error: expect.any(Error),
      }),
      'Regeneration job permanent failure',
    );
  });

  it('catch path returns sanitized permanent-failure and includes planId when present', async () => {
    const findFirst = vi.fn(async () => {
      throw new Error('db boom');
    });
    const failJob = vi.fn(async () => null);
    const deps = buildProcessDeps({
      dbClient: {
        query: { learningPlans: { findFirst } },
      } as unknown as DbClient,
      queue: { failJob },
    });
    const job = makeJob();
    const result = await processPlanRegenerationJob(job, deps);
    expect(result).toEqual({
      kind: 'permanent-failure',
      jobId: job.id,
      planId: planRow.id,
    });
    expect(failJob).toHaveBeenCalledWith(
      job.id,
      'Queued plan regeneration failed.',
      {
        retryable: false,
      },
    );
    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: job.id, error: expect.any(Error) }),
      'Failed while processing queued plan regeneration job',
    );
  });

  it('already_finalized completes with zero counts', async () => {
    const completeJob = vi.fn(async () => null);
    const processAttempt = vi.fn().mockResolvedValue({
      status: 'already_finalized',
    });
    const deps = buildProcessDeps({
      queue: { completeJob },
      lifecycle: {
        service: makeLifecycleServiceMock(processAttempt),
      },
    });
    const job = makeJob();
    const result = await processPlanRegenerationJob(job, deps);
    expect(result.kind).toBe('already-finalized');
    expect(completeJob).toHaveBeenCalledWith(job.id, {
      planId: planRow.id,
      modulesCount: 0,
      tasksCount: 0,
      durationMs: 0,
    });
  });
});
