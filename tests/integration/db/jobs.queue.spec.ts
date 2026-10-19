import {
  completeJob,
  enqueueJobWithResult,
  failJob,
} from '@/features/jobs/queue';
import {
  JOB_TYPES,
  type JobPayload,
  type JobType,
  type PlanRegenerationJobData,
} from '@/features/jobs/types';
import {
  JOB_RETRY_BASE_SECONDS,
  JOB_RETRY_MAX_DELAY_SECONDS,
} from '@/shared/constants/retry-policy';
import { jobQueue, learningPlans } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { claimPendingRegenerationJob } from '@tests/helpers/db/jobs';
import { ensureUser } from '@tests/helpers/db/users';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

const JOB_TYPE = JOB_TYPES.PLAN_REGENERATION;

function nominalRetryBackoffMs(attempt: number): number {
  const n = Math.max(1, Math.trunc(attempt));
  return (
    Math.min(
      JOB_RETRY_MAX_DELAY_SECONDS,
      JOB_RETRY_BASE_SECONDS * 2 ** (n - 1),
    ) * 1000
  );
}

function expectScheduledDelayNearNominal(
  deltaMs: number,
  attempt: number,
): void {
  const nominal = nominalRetryBackoffMs(attempt);
  const low = Math.floor(nominal * 0.75) - 2;
  const high = Math.ceil(nominal * 1.25) + 2;
  expect(deltaMs).toBeGreaterThanOrEqual(low);
  expect(deltaMs).toBeLessThanOrEqual(high);
}

type InsertedPlan = typeof learningPlans.$inferSelect;

async function enqueueJob(
  type: JobType,
  planId: string | null,
  userId: string,
  data: JobPayload,
): Promise<string> {
  return (await enqueueJobWithResult(type, planId, userId, data)).id;
}

type PlanFixture = {
  plan: InsertedPlan;
  userId: string;
  authUserId: string;
};

function buildPlanRegenerationPayload(
  plan: InsertedPlan,
  data: Partial<PlanRegenerationJobData> = {},
): PlanRegenerationJobData {
  return {
    planId: plan.id,
    overrides: {
      skillLevel: data.overrides?.skillLevel ?? plan.skillLevel,
      weeklyHours: data.overrides?.weeklyHours ?? plan.weeklyHours,
      learningStyle: data.overrides?.learningStyle ?? plan.learningStyle,
      startDate: data.overrides?.startDate ?? null,
      deadlineDate: data.overrides?.deadlineDate ?? null,
    },
  };
}

async function createPlanFixture(key: string): Promise<PlanFixture> {
  const authUserId = `queue-${key}`;
  const email = `${authUserId}@example.com`;
  const userId = await ensureUser({ authUserId, email });

  const plan = await createPlanForUser(userId, key);

  return { plan, userId, authUserId };
}

async function createPlanForUser(
  userId: string,
  key: string,
): Promise<InsertedPlan> {
  const [plan] = await db
    .insert(learningPlans)
    .values({
      userId,
      topic: `Queue Test Plan ${key}`,
      skillLevel: 'intermediate',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
    })
    .returning();

  if (!plan) {
    throw new Error('Failed to insert plan fixture');
  }

  return plan;
}

describe('Job queue service', () => {
  it('enqueues a job with expected defaults', async () => {
    const { plan, userId } = await createPlanFixture('defaults');
    const payload = buildPlanRegenerationPayload(plan);

    const jobId = await enqueueJob(JOB_TYPE, plan.id, userId, payload);

    const [record] = await db
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.id, jobId));

    expect(record).toBeDefined();
    expect(record?.status).toBe('pending');
    expect(record?.priority).toBe(0);
    expect(record?.attempts).toBe(0);
    expect(record?.maxAttempts).toBe(3);
    expect(record?.payload).toEqual(payload);
    expect(record?.jobType).toBe(JOB_TYPE);
    expect(record?.scheduledFor).toBeInstanceOf(Date);
  });

  it('handles retry transitions and terminal failure', async () => {
    const { plan, userId } = await createPlanFixture('retry');
    const jobId = await enqueueJob(
      JOB_TYPE,
      plan.id,
      userId,
      buildPlanRegenerationPayload(plan),
    );

    expect((await claimPendingRegenerationJob(jobId))?.status).toBe(
      'processing',
    );
    const first = await failJob(jobId, 'transient error');
    expect(first?.status).toBe('pending');
    expect(first?.attempts).toBe(1);
    expect(first?.error).toBeNull();
    expect(first?.completedAt).toBeNull();
    const firstRetryRow = await db.query.jobQueue.findFirst({
      where: (fields, operators) => operators.eq(fields.id, jobId),
    });
    expect(firstRetryRow).toBeDefined();
    if (!firstRetryRow) {
      throw new Error('Expected first retry row');
    }
    expectScheduledDelayNearNominal(
      firstRetryRow.scheduledFor.getTime() - firstRetryRow.updatedAt.getTime(),
      1,
    );

    expect((await claimPendingRegenerationJob(jobId))?.status).toBe(
      'processing',
    );
    const second = await failJob(jobId, 'still failing');
    expect(second?.status).toBe('pending');
    expect(second?.attempts).toBe(2);
    const secondRetryRow = await db.query.jobQueue.findFirst({
      where: (fields, operators) => operators.eq(fields.id, jobId),
    });
    expect(secondRetryRow).toBeDefined();
    if (!secondRetryRow) {
      throw new Error('Expected second retry row');
    }
    expectScheduledDelayNearNominal(
      secondRetryRow.scheduledFor.getTime() -
        secondRetryRow.updatedAt.getTime(),
      2,
    );

    expect((await claimPendingRegenerationJob(jobId))?.status).toBe(
      'processing',
    );
    const terminal = await failJob(jobId, 'fatal error');
    expect(terminal?.status).toBe('failed');
    expect(terminal?.attempts).toBe(3);
    expect(terminal?.error).toBe('fatal error');
    expect(terminal?.completedAt).toBeInstanceOf(Date);
  });

  it('honors retry-after when scheduling a rate-limited retry', async () => {
    const { plan, userId } = await createPlanFixture('retry-after');
    const jobId = await enqueueJob(
      JOB_TYPE,
      plan.id,
      userId,
      buildPlanRegenerationPayload(plan),
    );

    expect((await claimPendingRegenerationJob(jobId))?.status).toBe(
      'processing',
    );
    const retryAfterSeconds = 3_600;
    const retried = await failJob(jobId, 'rate limited', {
      retryable: true,
      retryAfter: retryAfterSeconds,
    });

    expect(retried?.status).toBe('pending');
    const retryRow = await db.query.jobQueue.findFirst({
      where: (fields, operators) => operators.eq(fields.id, jobId),
    });
    expect(retryRow).toBeDefined();
    if (!retryRow) {
      throw new Error('Expected rate-limited retry row');
    }
    expect(
      retryRow.scheduledFor.getTime() - retryRow.updatedAt.getTime(),
    ).toBeGreaterThanOrEqual(retryAfterSeconds * 1000);
  });

  it('preserves error history and clears workflow metadata for a scheduled retry', async () => {
    const { plan, userId } = await createPlanFixture('retry-workflow');
    const jobId = await enqueueJob(JOB_TYPE, plan.id, userId, {
      ...buildPlanRegenerationPayload(plan),
      workflow: {
        provider: 'workflow-sdk',
        runId: 'wrun_retry',
        startedAt: '2026-08-11T12:00:00.000Z',
      },
    });

    expect((await claimPendingRegenerationJob(jobId))?.status).toBe(
      'processing',
    );
    await failJob(jobId, 'transient error');

    const retryRow = await db.query.jobQueue.findFirst({
      where: (fields, operators) => operators.eq(fields.id, jobId),
    });

    expect(retryRow?.status).toBe('pending');
    expect(retryRow?.payload).toMatchObject({
      planId: plan.id,
      errorHistory: [
        {
          attempt: 1,
          error: 'transient error',
          timestamp: expect.any(String),
        },
      ],
    });
    expect(retryRow?.payload).not.toHaveProperty('workflow');
  });

  it('fails terminal on first failure when retryable is false', async () => {
    const { plan, userId } = await createPlanFixture('no-retry');
    const jobId = await enqueueJob(
      JOB_TYPE,
      plan.id,
      userId,
      buildPlanRegenerationPayload(plan),
    );

    expect((await claimPendingRegenerationJob(jobId))?.status).toBe(
      'processing',
    );
    const result = await failJob(jobId, 'non-retryable error', {
      retryable: false,
    });
    expect(result?.status).toBe('failed');
    expect(result?.attempts).toBe(1);
    expect(result?.error).toBe('non-retryable error');
    expect(result?.completedAt).toBeInstanceOf(Date);
  });

  it('respects custom maxAttempts for terminal retry cap', async () => {
    const { plan, userId } = await createPlanFixture('max-two');
    const jobId = await enqueueJob(
      JOB_TYPE,
      plan.id,
      userId,
      buildPlanRegenerationPayload(plan),
    );

    await db
      .update(jobQueue)
      .set({ maxAttempts: 2 })
      .where(eq(jobQueue.id, jobId));

    expect((await claimPendingRegenerationJob(jobId))?.status).toBe(
      'processing',
    );
    const first = await failJob(jobId, 'first');
    expect(first?.status).toBe('pending');
    expect(first?.attempts).toBe(1);

    expect((await claimPendingRegenerationJob(jobId))?.status).toBe(
      'processing',
    );
    const terminal = await failJob(jobId, 'second');
    expect(terminal?.status).toBe('failed');
    expect(terminal?.attempts).toBe(2);
    expect(terminal?.error).toBe('second');
  });

  it('completes jobs and preserves attempt counter', async () => {
    const { plan, userId } = await createPlanFixture('complete');
    const jobId = await enqueueJob(
      JOB_TYPE,
      plan.id,
      userId,
      buildPlanRegenerationPayload(plan),
    );

    expect((await claimPendingRegenerationJob(jobId))?.status).toBe(
      'processing',
    );
    const payload = {
      planId: plan.id,
      modulesCount: 3,
      tasksCount: 9,
      durationMs: 100,
    };
    const completed = await completeJob(jobId, payload);

    expect(completed?.status).toBe('completed');
    expect(completed?.attempts).toBe(0);
    expect(completed?.result).toEqual(payload);
    expect(completed?.error).toBeNull();
    expect(completed?.completedAt).toBeInstanceOf(Date);

    const duplicate = await completeJob(jobId, {
      planId: plan.id,
      modulesCount: 1,
      tasksCount: 1,
      durationMs: 10,
    });
    expect(duplicate?.result).toEqual(payload);
  });
});
