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

import {
  generationAttempts,
  jobQueue,
  learningPlans,
  modules,
  tasks,
} from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { enqueueJob } from '@/lib/jobs/queue';
import {
  JOB_TYPES,
  type Job,
  type PlanGenerationJobResult,
} from '@/lib/jobs/types';
import type { ProcessPlanGenerationJobResult } from '@/workers/handlers/plan-generation-handler';
import {
  PlanGenerationWorker,
  type JobHandler,
} from '@/workers/plan-generator';
import { PersistenceService } from '@/workers/services/persistence-service';

import { ensureUser } from '../../helpers/db';
import { buildTestClerkUserId, buildTestEmail } from '../../helpers/testIds';
import { createDefaultHandlers } from '../../helpers/workerHelpers';

const ORIGINAL_ENV = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  MOCK_GENERATION_FAILURE_RATE: process.env.MOCK_GENERATION_FAILURE_RATE,
  MOCK_GENERATION_DELAY_MS: process.env.MOCK_GENERATION_DELAY_MS,
};

beforeAll(() => {
  process.env.AI_PROVIDER = 'mock';
  process.env.MOCK_GENERATION_FAILURE_RATE = '0';
  process.env.MOCK_GENERATION_DELAY_MS = '250';
});

afterAll(() => {
  if (ORIGINAL_ENV.AI_PROVIDER === undefined) {
    delete process.env.AI_PROVIDER;
  } else {
    process.env.AI_PROVIDER = ORIGINAL_ENV.AI_PROVIDER;
  }

  if (ORIGINAL_ENV.MOCK_GENERATION_FAILURE_RATE === undefined) {
    delete process.env.MOCK_GENERATION_FAILURE_RATE;
  } else {
    process.env.MOCK_GENERATION_FAILURE_RATE =
      ORIGINAL_ENV.MOCK_GENERATION_FAILURE_RATE;
  }

  if (ORIGINAL_ENV.MOCK_GENERATION_DELAY_MS === undefined) {
    delete process.env.MOCK_GENERATION_DELAY_MS;
  } else {
    process.env.MOCK_GENERATION_DELAY_MS =
      ORIGINAL_ENV.MOCK_GENERATION_DELAY_MS;
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
    intervalMs = 50,
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

type PlanFixture = {
  planId: string;
  userId: string;
};

async function createPlanFixture(key: string): Promise<PlanFixture> {
  const clerkUserId = buildTestClerkUserId(`worker-${key}`);
  const userId = await ensureUser({
    clerkUserId,
    email: buildTestEmail(clerkUserId),
  });

  const [plan] = await db
    .insert(learningPlans)
    .values({
      userId,
      topic: `Worker Test Plan ${key}`,
      skillLevel: 'intermediate',
      weeklyHours: 4,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
    })
    .returning({ id: learningPlans.id });

  if (!plan?.id) {
    throw new Error('Failed to create plan fixture');
  }

  return { planId: plan.id, userId };
}

async function fetchJob(jobId: string) {
  return db.query.jobQueue.findFirst({
    where: (fields, operators) => operators.eq(fields.id, jobId),
  });
}

describe('PlanGenerationWorker', () => {
  it('processes a plan generation job end-to-end (J026 success + T072 + T073)', async () => {
    const worker = new PlanGenerationWorker({
      handlers: createDefaultHandlers(),
      pollIntervalMs: 40,
      concurrency: 1,
      closeDbOnStop: false,
    });

    const { planId, userId } = await createPlanFixture('success');
    const payload = {
      topic: 'Mock Driven Development',
      notes: 'Validate success path',
      skillLevel: 'intermediate' as const,
      weeklyHours: 4,
      learningStyle: 'mixed' as const,
    };
    const jobId = await enqueueJob(
      JOB_TYPES.PLAN_GENERATION,
      planId,
      userId,
      payload
    );

    const testStartedAt = Date.now();
    worker.start();

    try {
      await waitFor(async () => {
        const row = await fetchJob(jobId);
        if (row?.status === 'failed') {
          throw new Error(`Job failed: ${row.error ?? 'unknown error'}`);
        }
        return row?.status === 'completed';
      });
    } finally {
      await worker.stop();
    }

    const jobRow = await fetchJob(jobId);
    expect(jobRow?.status).toBe('completed');
    expect(jobRow?.error).toBeNull();
    expect(jobRow?.result).not.toBeNull();

    const jobResult = jobRow?.result as PlanGenerationJobResult | null;
    expect(jobResult?.modulesCount).toBeGreaterThan(0);
    expect(jobResult?.tasksCount).toBeGreaterThan(0);
    expect(jobResult?.durationMs).toBeGreaterThan(0);
    expect(jobResult?.durationMs).toBeLessThanOrEqual(12_000);

    const [attempt] = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, planId));
    expect(attempt?.status).toBe('success');

    const moduleRows = await db
      .select({ id: modules.id })
      .from(modules)
      .where(eq(modules.planId, planId));
    expect(moduleRows.length).toBeGreaterThan(0);

    const taskRows = moduleRows.length
      ? await db
          .select({ id: tasks.id })
          .from(tasks)
          .where(
            inArray(
              tasks.moduleId,
              moduleRows.map((module) => module.id)
            )
          )
      : [];
    expect(taskRows.length).toBeGreaterThan(0);

    const planJobs = await db
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.planId, planId));
    expect(planJobs).toHaveLength(1);
    expect(planJobs[0]?.status).toBe('completed');

    const totalElapsed = Date.now() - testStartedAt;
    expect(totalElapsed).toBeLessThan(15_000);

    const stats = worker.getStats();
    expect(stats.jobsStarted).toBe(1);
    expect(stats.jobsCompleted).toBe(1);
    expect(stats.jobsFailed).toBe(0);
  });

  it('retries a transient failure before succeeding (J026 retry path / T070)', async () => {
    const { planId, userId } = await createPlanFixture('retry');
    const jobId = await enqueueJob(JOB_TYPES.PLAN_GENERATION, planId, userId, {
      topic: 'Retry Path',
      notes: 'First attempt should fail',
      skillLevel: 'intermediate',
      weeklyHours: 3,
      learningStyle: 'reading',
    });

    const failure: ProcessPlanGenerationJobResult = {
      status: 'failure',
      error: 'Transient provider error',
      classification: 'provider_error',
      retryable: true,
    };

    const successPayload: PlanGenerationJobResult = {
      modulesCount: 2,
      tasksCount: 6,
      durationMs: 1_000,
      metadata: { provider: null, attemptId: 'retry-success' },
    };

    const success: ProcessPlanGenerationJobResult = {
      status: 'success',
      result: successPayload,
    };

    const persistenceService = new PersistenceService();
    const processSpy = vi
      .fn<JobHandler['processJob']>()
      .mockImplementationOnce(async (job: Job) => {
        await persistenceService.failJob({
          jobId: job.id,
          planId: job.planId,
          userId: job.userId,
          error: failure.error,
          retryable: failure.retryable,
        });
        return failure;
      })
      .mockImplementationOnce(async (job: Job) => {
        await persistenceService.completeJob({
          jobId: job.id,
          planId: job.planId!,
          userId: job.userId,
          result: successPayload,
          metadata: undefined,
        });
        return success;
      });

    const worker = new PlanGenerationWorker({
      handlers: {
        [JOB_TYPES.PLAN_GENERATION]: {
          processJob: (job, opts) => processSpy(job, opts),
        },
        [JOB_TYPES.PLAN_REGENERATION]: {
          async processJob() {
            return {
              status: 'failure',
              error:
                'Unexpected regeneration job in PlanGenerationWorker retry test',
              classification: 'unknown',
              retryable: false,
            };
          },
        },
      },
      pollIntervalMs: 25,
      concurrency: 1,
      closeDbOnStop: false,
    });

    worker.start();

    try {
      await waitFor(() => Promise.resolve(processSpy.mock.calls.length === 2));
    } finally {
      await worker.stop();
    }

    expect(processSpy.mock.calls.length).toBe(2);

    const [firstCall, secondCall] = processSpy.mock.calls;
    const firstJob = firstCall?.[0] as Job | undefined;
    const secondJob = secondCall?.[0] as Job | undefined;

    expect(firstJob?.attempts).toBe(0);
    expect(secondJob?.attempts).toBe(1);

    const jobRow = await fetchJob(jobId);
    expect(jobRow?.status).toBe('completed');
    expect(jobRow?.attempts).toBe(1);
    expect(jobRow?.result).toMatchObject(successPayload);

    const stats = worker.getStats();
    expect(stats.jobsStarted).toBe(2);
    expect(stats.jobsCompleted).toBe(1);
    expect(stats.jobsFailed).toBe(1);
  });

  it('processes jobs in priority/creation order under load (J026 concurrency + T071)', async () => {
    const { planId, userId } = await createPlanFixture('ordering');

    const jobIds = await Promise.all([
      enqueueJob(
        JOB_TYPES.PLAN_GENERATION,
        planId,
        userId,
        { idx: 'high-a' },
        10
      ),
      enqueueJob(
        JOB_TYPES.PLAN_GENERATION,
        planId,
        userId,
        { idx: 'high-b' },
        10
      ),
      enqueueJob(
        JOB_TYPES.PLAN_GENERATION,
        planId,
        userId,
        { idx: 'mid-a' },
        5
      ),
      enqueueJob(
        JOB_TYPES.PLAN_GENERATION,
        planId,
        userId,
        { idx: 'mid-b' },
        5
      ),
      enqueueJob(JOB_TYPES.PLAN_GENERATION, planId, userId, { idx: 'low' }, 0),
    ]);

    const order: Array<{ id: string; priority: number; createdAt: Date }> = [];

    const stubResult: ProcessPlanGenerationJobResult = {
      status: 'success',
      result: {
        modulesCount: 0,
        tasksCount: 0,
        durationMs: 100,
        metadata: { provider: null, attemptId: 'ordered' },
      },
    };

    const persistenceService = new PersistenceService();
    const processSpy = vi
      .fn<JobHandler['processJob']>()
      .mockImplementation(async (job: Job) => {
        order.push({
          id: job.id,
          priority: job.priority,
          createdAt: job.createdAt,
        });

        await persistenceService.completeJob({
          jobId: job.id,
          planId: job.planId!,
          userId: job.userId,
          result: stubResult.result,
          metadata: undefined,
        });

        return stubResult;
      });

    const worker = new PlanGenerationWorker({
      handlers: {
        [JOB_TYPES.PLAN_GENERATION]: {
          processJob: (job, opts) => processSpy(job, opts),
        },
        [JOB_TYPES.PLAN_REGENERATION]: {
          async processJob() {
            return {
              status: 'failure',
              error:
                'Unexpected regeneration job in PlanGenerationWorker ordering test',
              classification: 'unknown',
              retryable: false,
            };
          },
        },
      },
      pollIntervalMs: 20,
      concurrency: 2,
      closeDbOnStop: false,
    });

    worker.start();

    try {
      await waitFor(() => Promise.resolve(order.length === jobIds.length));
    } finally {
      await worker.stop();
    }

    expect(order.length).toBe(jobIds.length);

    const priorities = order.map((item) => item.priority);
    expect(priorities).toEqual([10, 10, 5, 5, 0]);

    const highOrder = order
      .filter((item) => item.priority === 10)
      .map((item) => item.id);
    expect(highOrder).toHaveLength(2);
    expect(new Set(highOrder)).toEqual(new Set([jobIds[0], jobIds[1]]));

    const midOrder = order
      .filter((item) => item.priority === 5)
      .map((item) => item.id);
    expect(midOrder).toHaveLength(2);
    expect(new Set(midOrder)).toEqual(new Set([jobIds[2], jobIds[3]]));

    const lowOrder = order
      .filter((item) => item.priority === 0)
      .map((item) => item.id);
    expect(lowOrder).toEqual([jobIds[4]]);
  });

  it('waits for in-flight jobs during graceful shutdown (J026 graceful)', async () => {
    const { planId, userId } = await createPlanFixture('graceful');
    const jobId = await enqueueJob(JOB_TYPES.PLAN_GENERATION, planId, userId, {
      topic: 'Graceful shutdown',
      notes: 'Simulate long running work',
      skillLevel: 'advanced',
      weeklyHours: 2,
      learningStyle: 'practice',
    });

    const _result: ProcessPlanGenerationJobResult = {
      status: 'success',
      result: {
        modulesCount: 1,
        tasksCount: 3,
        durationMs: 500,
        metadata: { provider: null, attemptId: 'graceful' },
      },
    };

    const worker = new PlanGenerationWorker({
      handlers: createDefaultHandlers(),
      pollIntervalMs: 20,
      concurrency: 1,
      closeDbOnStop: false,
    });

    worker.start();

    await waitFor(async () => {
      const row = await fetchJob(jobId);
      return row?.status === 'processing';
    });

    await worker.stop();

    const finalJob = await fetchJob(jobId);
    expect(finalJob?.status).toBe('completed');
    expect(finalJob?.completedAt).toBeInstanceOf(Date);

    const stats = worker.getStats();
    expect(stats.jobsStarted).toBe(1);
    expect(stats.jobsCompleted).toBe(1);
    expect(stats.jobsFailed).toBe(0);
  });
});
