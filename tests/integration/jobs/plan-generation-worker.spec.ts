import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import {
  generationAttempts,
  jobQueue as _jobQueue,
  learningPlans,
  modules,
  tasks,
} from '@/lib/db/schema';
import { getLearningPlanDetail } from '@/lib/db/queries/plans';
import { enqueueJob } from '@/lib/jobs/queue';
import { JOB_TYPES, type PlanGenerationJobResult } from '@/lib/jobs/types';
import type { ProcessPlanGenerationJobResult } from '@/lib/jobs/worker-service';
import * as workerService from '@/lib/jobs/worker-service';
import { PlanGenerationWorker } from '@/workers/plan-generator';
import { mapDetailToClient } from '@/lib/mappers/detailToClient';

import { ensureUser } from '../../helpers/db';

const originalEnv = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  MOCK_GENERATION_FAILURE_RATE: process.env.MOCK_GENERATION_FAILURE_RATE,
  MOCK_GENERATION_DELAY_MS: process.env.MOCK_GENERATION_DELAY_MS,
};

beforeAll(() => {
  process.env.AI_PROVIDER = 'mock';
  process.env.MOCK_GENERATION_FAILURE_RATE = '0';
  process.env.MOCK_GENERATION_DELAY_MS = '1000';
});

afterAll(() => {
  if (originalEnv.AI_PROVIDER === undefined) {
    delete process.env.AI_PROVIDER;
  } else {
    process.env.AI_PROVIDER = originalEnv.AI_PROVIDER;
  }

  if (originalEnv.MOCK_GENERATION_FAILURE_RATE === undefined) {
    delete process.env.MOCK_GENERATION_FAILURE_RATE;
  } else {
    process.env.MOCK_GENERATION_FAILURE_RATE =
      originalEnv.MOCK_GENERATION_FAILURE_RATE;
  }

  if (originalEnv.MOCK_GENERATION_DELAY_MS === undefined) {
    delete process.env.MOCK_GENERATION_DELAY_MS;
  } else {
    process.env.MOCK_GENERATION_DELAY_MS = originalEnv.MOCK_GENERATION_DELAY_MS;
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  predicate: () => Promise<boolean>,
  {
    timeoutMs = 10_000,
    intervalMs = 100,
  }: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await sleep(intervalMs);
  }

  throw new Error('Timed out waiting for condition');
}

function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function fetchJob(jobId: string) {
  return db.query.jobQueue.findFirst({
    where: (fields, operators) => operators.eq(fields.id, jobId),
  });
}

async function createPlanForUser(key: string) {
  const clerkUserId = `worker-${key}`;
  const userId = await ensureUser({
    clerkUserId,
    email: `${clerkUserId}@example.com`,
  });

  const [plan] = await db
    .insert(learningPlans)
    .values({
      userId,
      topic: `Worker Plan ${key}`,
      skillLevel: 'intermediate',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
    })
    .returning();

  if (!plan) {
    throw new Error('Failed to create plan for test');
  }

  return { plan, userId };
}

describe('PlanGenerationWorker', () => {
  it('cycles without jobs in the queue (T030)', async () => {
    const worker = new PlanGenerationWorker({
      pollIntervalMs: 50,
      concurrency: 1,
      closeDbOnStop: false,
    });

    worker.start();

    try {
      await waitFor(async () => worker.getStats().polls >= 3, {
        timeoutMs: 2000,
        intervalMs: 50,
      });
    } finally {
      await worker.stop();
    }

    const stats = worker.getStats();
    expect(stats.jobsStarted).toBe(0);
    expect(stats.jobsCompleted).toBe(0);
    expect(stats.jobsFailed).toBe(0);
    expect(stats.polls).toBeGreaterThanOrEqual(3);
    expect(stats.idlePolls).toBe(stats.polls);
  });

  it('processes a single plan generation job end-to-end (T031)', async () => {
    const worker = new PlanGenerationWorker({
      pollIntervalMs: 50,
      concurrency: 1,
      closeDbOnStop: false,
    });

    const clerkUserId = 'worker-test-user';
    const userId = await ensureUser({
      clerkUserId,
      email: 'worker-test-user@example.com',
    });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Background Workers in TypeScript',
        skillLevel: 'intermediate',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    if (!plan) {
      throw new Error('Failed to insert plan for test');
    }

    const jobId = await enqueueJob(JOB_TYPES.PLAN_GENERATION, plan.id, userId, {
      topic: plan.topic,
      notes: 'Focus on reliability and retries.',
      skillLevel: plan.skillLevel,
      weeklyHours: plan.weeklyHours,
      learningStyle: plan.learningStyle,
    });

    worker.start();

    try {
      await waitFor(async () => {
        const jobRow = await db.query.jobQueue.findFirst({
          where: (fields, operators) => operators.eq(fields.id, jobId),
        });
        if (jobRow?.status === 'failed') {
          throw new Error(`Job failed: ${jobRow.error ?? 'unknown error'}`);
        }
        return jobRow?.status === 'completed';
      });
    } finally {
      await worker.stop();
    }

    const jobRow = await db.query.jobQueue.findFirst({
      where: (fields, operators) => operators.eq(fields.id, jobId),
    });
    expect(jobRow?.status).toBe('completed');
    expect(jobRow?.error).toBeNull();
    expect(jobRow?.result).not.toBeNull();

    const jobResult = jobRow?.result as PlanGenerationJobResult | null;
    expect(jobResult?.modulesCount).toBeGreaterThan(0);
    expect(jobResult?.tasksCount).toBeGreaterThan(0);
    expect(jobResult?.durationMs).toBeGreaterThan(0);
    expect(jobResult?.metadata?.attemptId).toBeTruthy();

    const moduleRows = await db
      .select()
      .from(modules)
      .where(eq(modules.planId, plan.id));
    expect(moduleRows.length).toBeGreaterThan(0);

    const taskRows = moduleRows.length
      ? await db
          .select()
          .from(tasks)
          .where(
            inArray(
              tasks.moduleId,
              moduleRows.map((module) => module.id)
            )
          )
      : [];
    expect(taskRows.length).toBeGreaterThan(0);
    expect(jobResult?.modulesCount).toBe(moduleRows.length);
    expect(jobResult?.tasksCount).toBe(taskRows.length);

    const attemptRows = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id));
    expect(attemptRows.length).toBe(1);
    expect(attemptRows[0]?.status).toBe('success');

    const detail = await getLearningPlanDetail(plan.id, userId);
    const clientPlan = detail ? mapDetailToClient(detail) : undefined;
    expect(clientPlan?.status).toBe('ready');

    const stats = worker.getStats();
    expect(stats.jobsStarted).toBe(1);
    expect(stats.jobsCompleted).toBe(1);
    expect(stats.jobsFailed).toBe(0);
  });

  it('retries a transient failure before completing successfully (T032)', async () => {
    const worker = new PlanGenerationWorker({
      pollIntervalMs: 50,
      concurrency: 1,
      closeDbOnStop: false,
    });

    const { plan, userId } = await createPlanForUser('retry-transient');

    const jobId = await enqueueJob(JOB_TYPES.PLAN_GENERATION, plan.id, userId, {
      topic: plan.topic,
      notes: 'Trigger retry path',
      skillLevel: plan.skillLevel,
      weeklyHours: plan.weeklyHours,
      learningStyle: plan.learningStyle,
    });

    const transientFailure: ProcessPlanGenerationJobResult = {
      status: 'failure',
      error: 'Transient provider error',
      classification: 'provider_error',
      retryable: true,
    };

    const successPayload: PlanGenerationJobResult = {
      modulesCount: 3,
      tasksCount: 9,
      durationMs: 1_200,
      metadata: { provider: null, attemptId: 'attempt-after-retry' },
    };

    const successResult: ProcessPlanGenerationJobResult = {
      status: 'success',
      result: successPayload,
    };

    const processSpy = vi
      .spyOn(workerService, 'processPlanGenerationJob')
      .mockResolvedValueOnce(transientFailure)
      .mockResolvedValueOnce(successResult);

    worker.start();

    try {
      await waitFor(() => Promise.resolve(processSpy.mock.calls.length === 2));
    } finally {
      await worker.stop();
    }

    expect(processSpy.mock.calls.length).toBe(2);

    const [firstCall, secondCall] = processSpy.mock.calls as [
      [Parameters<typeof workerService.processPlanGenerationJob>[0]],
      [Parameters<typeof workerService.processPlanGenerationJob>[0]],
    ];

    expect(firstCall?.[0].attempts).toBe(0);
    expect(secondCall?.[0].attempts).toBe(1);

    const finalJob = await fetchJob(jobId);
    expect(finalJob?.status).toBe('completed');
    expect(finalJob?.attempts).toBe(1);
    expect(finalJob?.error).toBeNull();
    expect(finalJob?.result).toMatchObject(successPayload);

    const stats = worker.getStats();
    expect(stats.jobsStarted).toBe(2);
    expect(stats.jobsCompleted).toBe(1);
    expect(stats.jobsFailed).toBe(1);
  });

  it('marks a job and plan as failed after exhausting max attempts (T033)', async () => {
    const worker = new PlanGenerationWorker({
      pollIntervalMs: 50,
      concurrency: 1,
      closeDbOnStop: false,
    });

    const previousFailureRate = process.env.MOCK_GENERATION_FAILURE_RATE;
    process.env.MOCK_GENERATION_FAILURE_RATE = '1';

    const { plan, userId } = await createPlanForUser('max-attempts');

    const jobId = await enqueueJob(JOB_TYPES.PLAN_GENERATION, plan.id, userId, {
      topic: plan.topic,
      notes: 'Always fail',
      skillLevel: plan.skillLevel,
      weeklyHours: plan.weeklyHours,
      learningStyle: plan.learningStyle,
    });

    worker.start();

    try {
      await waitFor(
        async () => {
          const jobRow = await fetchJob(jobId);
          return jobRow?.status === 'failed';
        },
        { timeoutMs: 20_000, intervalMs: 100 }
      );
    } finally {
      if (previousFailureRate === undefined) {
        delete process.env.MOCK_GENERATION_FAILURE_RATE;
      } else {
        process.env.MOCK_GENERATION_FAILURE_RATE = previousFailureRate;
      }
      await worker.stop();
    }

    const finalJob = await fetchJob(jobId);
    expect(finalJob?.status).toBe('failed');
    expect(finalJob?.attempts).toBe(finalJob?.maxAttempts ?? 3);
    expect(finalJob?.result).toBeNull();
    expect(finalJob?.error).toContain('Mock provider simulated failure');
    expect(finalJob?.completedAt).toBeInstanceOf(Date);

    const attempts = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id));
    expect(attempts).toHaveLength(finalJob?.attempts ?? 0);
    expect(attempts.every((attempt) => attempt.status === 'failure')).toBe(
      true
    );

    const moduleRows = await db
      .select()
      .from(modules)
      .where(eq(modules.planId, plan.id));
    expect(moduleRows.length).toBe(0);

    const detail = await getLearningPlanDetail(plan.id, userId);
    const clientPlan = detail ? mapDetailToClient(detail) : undefined;
    expect(clientPlan?.status).toBe('failed');

    const stats = worker.getStats();
    expect(stats.jobsStarted).toBe(finalJob?.attempts ?? 3);
    expect(stats.jobsCompleted).toBe(0);
    expect(stats.jobsFailed).toBeGreaterThanOrEqual(finalJob?.attempts ?? 3);
  });

  it('processes jobs sequentially when concurrency is set to 1 (T034)', async () => {
    const worker = new PlanGenerationWorker({
      pollIntervalMs: 25,
      concurrency: 1,
      closeDbOnStop: false,
    });

    const { plan: planA, userId } = await createPlanForUser('sequential-a');
    const [planB] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Worker Plan sequential-b',
        skillLevel: 'intermediate',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    if (!planB) {
      throw new Error('Failed to create second plan for concurrency test');
    }

    const jobA = await enqueueJob(JOB_TYPES.PLAN_GENERATION, planA.id, userId, {
      topic: planA.topic,
      notes: 'First job',
      skillLevel: planA.skillLevel,
      weeklyHours: planA.weeklyHours,
      learningStyle: planA.learningStyle,
    });
    const jobB = await enqueueJob(JOB_TYPES.PLAN_GENERATION, planB.id, userId, {
      topic: planB.topic,
      notes: 'Second job',
      skillLevel: planB.skillLevel,
      weeklyHours: planB.weeklyHours,
      learningStyle: planB.learningStyle,
    });

    const firstDeferred = createDeferred();
    let firstReleased = false;

    const firstSuccess: ProcessPlanGenerationJobResult = {
      status: 'success',
      result: {
        modulesCount: 2,
        tasksCount: 6,
        durationMs: 800,
        metadata: { provider: null, attemptId: 'sequential-first' },
      },
    };

    const secondSuccess: ProcessPlanGenerationJobResult = {
      status: 'success',
      result: {
        modulesCount: 4,
        tasksCount: 12,
        durationMs: 900,
        metadata: { provider: null, attemptId: 'sequential-second' },
      },
    };

    const processSpy = vi
      .spyOn(workerService, 'processPlanGenerationJob')
      .mockImplementationOnce(async () => {
        await firstDeferred.promise;
        firstReleased = true;
        return firstSuccess;
      })
      .mockResolvedValueOnce(secondSuccess);

    worker.start();

    try {
      await waitFor(() => Promise.resolve(processSpy.mock.calls.length === 1));

      const firstJobId = processSpy.mock.calls[0]?.[0].id;
      expect(firstJobId).toBeDefined();

      const pendingJobId = firstJobId === jobA ? jobB : jobA;
      const pendingJob = await fetchJob(pendingJobId);
      expect(pendingJob?.status).toBe('pending');
      expect(pendingJob?.startedAt).toBeNull();

      firstDeferred.resolve();
      firstReleased = true;

      await waitFor(() => Promise.resolve(processSpy.mock.calls.length === 2));

      const secondJobId = processSpy.mock.calls[1]?.[0].id;
      expect(secondJobId).toBe(pendingJobId);

      await waitFor(async () => {
        const firstJob = await fetchJob(jobA);
        const secondJob = await fetchJob(jobB);
        return (
          firstJob?.status === 'completed' && secondJob?.status === 'completed'
        );
      });
    } finally {
      if (!firstReleased) {
        firstDeferred.resolve();
      }
      await worker.stop();
    }

    expect(processSpy.mock.calls.length).toBe(2);

    const completedA = await fetchJob(jobA);
    const completedB = await fetchJob(jobB);

    expect(completedA?.status).toBe('completed');
    expect(completedB?.status).toBe('completed');
    expect(completedA?.completedAt).toBeInstanceOf(Date);
    expect(completedB?.completedAt).toBeInstanceOf(Date);
    expect(completedB?.startedAt?.getTime()).toBeGreaterThanOrEqual(
      completedA?.completedAt?.getTime() ?? 0
    );

    const stats = worker.getStats();
    expect(stats.jobsStarted).toBe(2);
    expect(stats.jobsCompleted).toBe(2);
    expect(stats.jobsFailed).toBe(0);
  });

  it('waits for in-flight work during graceful shutdown (T035)', async () => {
    const worker = new PlanGenerationWorker({
      pollIntervalMs: 25,
      concurrency: 1,
      closeDbOnStop: false,
    });

    const { plan, userId } = await createPlanForUser('graceful-stop');

    const jobId = await enqueueJob(JOB_TYPES.PLAN_GENERATION, plan.id, userId, {
      topic: plan.topic,
      notes: 'Long running job',
      skillLevel: plan.skillLevel,
      weeklyHours: plan.weeklyHours,
      learningStyle: plan.learningStyle,
    });

    const longRunningSuccess: ProcessPlanGenerationJobResult = {
      status: 'success',
      result: {
        modulesCount: 3,
        tasksCount: 9,
        durationMs: 2_500,
        metadata: { provider: null, attemptId: 'graceful' },
      },
    };

    vi.spyOn(workerService, 'processPlanGenerationJob').mockImplementation(
      async () => {
        await sleep(250);
        return longRunningSuccess;
      }
    );

    worker.start();

    await waitFor(async () => {
      const jobRow = await fetchJob(jobId);
      return jobRow?.status === 'processing';
    });

    await worker.stop();

    const finalJob = await fetchJob(jobId);
    expect(finalJob?.status).toBe('completed');
    expect(finalJob?.attempts).toBe(0);
    expect(finalJob?.completedAt).toBeInstanceOf(Date);
    expect(finalJob?.error).toBeNull();

    const stats = worker.getStats();
    expect(stats.jobsStarted).toBe(1);
    expect(stats.jobsCompleted).toBe(1);
    expect(stats.jobsFailed).toBe(0);
  });

  it('fails fast on invalid job data and surfaces validation errors (T036)', async () => {
    const worker = new PlanGenerationWorker({
      pollIntervalMs: 25,
      concurrency: 1,
      closeDbOnStop: false,
    });

    const { plan, userId } = await createPlanForUser('validation');

    const jobId = await enqueueJob(JOB_TYPES.PLAN_GENERATION, plan.id, userId, {
      topic: 'hi',
      notes: '',
      skillLevel: plan.skillLevel,
      weeklyHours: plan.weeklyHours,
      learningStyle: plan.learningStyle,
    });

    worker.start();

    try {
      await waitFor(async () => {
        const jobRow = await fetchJob(jobId);
        return jobRow?.status === 'failed';
      });
    } finally {
      await worker.stop();
    }

    const failedJob = await fetchJob(jobId);
    expect(failedJob?.status).toBe('failed');
    expect(failedJob?.attempts).toBe(1);
    expect(failedJob?.result).toBeNull();
    expect(failedJob?.error).toContain('Invalid job data');

    const detail = await getLearningPlanDetail(plan.id, userId);
    const clientPlan = detail ? mapDetailToClient(detail) : undefined;
    expect(clientPlan?.status).toBe('failed');

    const stats = worker.getStats();
    expect(stats.jobsStarted).toBe(1);
    expect(stats.jobsCompleted).toBe(0);
    expect(stats.jobsFailed).toBe(1);
  });
});
