import { and, eq, lt } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '@/lib/db/service-role';
import { jobQueue, learningPlans, users } from '@/lib/db/schema';
import {
  completeJob,
  enqueueJob,
  failJob,
  getJobsByPlanId,
  getNextJob,
  getUserJobCount,
} from '@/lib/jobs/queue';
import {
  JOB_TYPES,
  type JobType,
  type PlanGenerationJobData,
} from '@/lib/jobs/types';
import { computeJobPriority, isPriorityTopic } from '@/lib/queue/priority';

import { ensureUser } from '../../../../tests/helpers/db';

const JOB_TYPE = JOB_TYPES.PLAN_GENERATION;

type InsertedPlan = typeof learningPlans.$inferSelect;

type PlanFixture = {
  plan: InsertedPlan;
  userId: string;
  authUserId: string;
};

function buildPlanGenerationPayload(
  plan: InsertedPlan,
  overrides: Partial<PlanGenerationJobData> = {}
): PlanGenerationJobData {
  return {
    topic: overrides.topic ?? plan.topic,
    notes: overrides.notes ?? null,
    skillLevel: overrides.skillLevel ?? plan.skillLevel,
    weeklyHours: overrides.weeklyHours ?? plan.weeklyHours,
    learningStyle: overrides.learningStyle ?? plan.learningStyle,
    startDate: overrides.startDate ?? null,
    deadlineDate: overrides.deadlineDate ?? null,
  };
}

async function createPlanFixture(key: string): Promise<PlanFixture> {
  const authUserId = `queue-${key}`;
  const email = `${authUserId}@example.com`;
  const userId = await ensureUser({ authUserId, email });

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

  return { plan, userId, authUserId };
}

describe('Job queue service', () => {
  it('enqueues a job with expected defaults', async () => {
    const { plan, userId } = await createPlanFixture('defaults');
    const payload = {
      topic: plan.topic,
      notes: 'Ensure defaults',
      skillLevel: plan.skillLevel,
      weeklyHours: plan.weeklyHours,
      learningStyle: plan.learningStyle,
      startDate: null,
      deadlineDate: null,
    };

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

  it('locks a single pending job per worker request', async () => {
    const { plan, userId } = await createPlanFixture('lock');

    const jobIds = await Promise.all([
      enqueueJob(
        JOB_TYPE,
        plan.id,
        userId,
        buildPlanGenerationPayload(plan, { topic: 'job-1' })
      ),
      enqueueJob(
        JOB_TYPE,
        plan.id,
        userId,
        buildPlanGenerationPayload(plan, { topic: 'job-2' })
      ),
    ]);

    const [first, second] = await Promise.all([
      getNextJob([JOB_TYPE]),
      getNextJob([JOB_TYPE]),
    ]);

    expect(first?.id).toBeDefined();
    expect(second?.id).toBeDefined();
    expect(first?.id).not.toBe(second?.id);
    expect(jobIds).toContain(first?.id ?? '');
    expect(jobIds).toContain(second?.id ?? '');

    const firstRow = await db.query.jobQueue.findFirst({
      where: (fields, operators) => operators.eq(fields.id, first!.id),
    });
    const secondRow = await db.query.jobQueue.findFirst({
      where: (fields, operators) => operators.eq(fields.id, second!.id),
    });

    expect(firstRow?.status).toBe('processing');
    expect(firstRow?.startedAt).toBeInstanceOf(Date);
    expect(secondRow?.status).toBe('processing');
    expect(secondRow?.startedAt).toBeInstanceOf(Date);
  });

  it('respects priority then FIFO ordering for getNextJob', async () => {
    const { plan, userId } = await createPlanFixture('priority');

    const low = await enqueueJob(
      JOB_TYPE,
      plan.id,
      userId,
      buildPlanGenerationPayload(plan, { topic: 'low-order' }),
      0
    );
    const midA = await enqueueJob(
      JOB_TYPE,
      plan.id,
      userId,
      buildPlanGenerationPayload(plan, { topic: 'mid-a-order' }),
      5
    );
    const midB = await enqueueJob(
      JOB_TYPE,
      plan.id,
      userId,
      buildPlanGenerationPayload(plan, { topic: 'mid-b-order' }),
      5
    );
    const high = await enqueueJob(
      JOB_TYPE,
      plan.id,
      userId,
      buildPlanGenerationPayload(plan, { topic: 'high-order' }),
      10
    );

    const processed: string[] = [];
    const priorities: number[] = [];

    for (let i = 0; i < 4; i += 1) {
      const job = await getNextJob([JOB_TYPE]);
      expect(job).not.toBeNull();
      processed.push(job!.id);
      priorities.push(job!.priority);
    }

    expect(priorities).toEqual([10, 5, 5, 0]);
    expect(processed[0]).toBe(high);
    expect(processed.at(-1)).toBe(low);

    const midOrder = processed.filter((id) => id === midA || id === midB);
    expect(midOrder).toEqual([midA, midB]);
  });

  it('picks paid+priority before free', async () => {
    // Create free user with non-priority topic
    const freeUser = await createPlanFixture('free-user');
    await db
      .update(users)
      .set({ subscriptionTier: 'free' })
      .where(eq(users.id, freeUser.userId));

    const freeTopic = 'zzzzzzzzzzzzzzzzzzzz'; // Guaranteed non-priority topic
    expect(isPriorityTopic(freeTopic)).toBe(false);
    const freePlan = await db
      .insert(learningPlans)
      .values({
        userId: freeUser.userId,
        topic: freeTopic,
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    if (!freePlan[0]) {
      throw new Error('Failed to create free plan');
    }

    // Create paid user (pro) with priority topic
    const paidUser = await createPlanFixture('paid-user');
    await db
      .update(users)
      .set({ subscriptionTier: 'pro' })
      .where(eq(users.id, paidUser.userId));

    const paidTopic = 'interview prep'; // Priority topic
    expect(isPriorityTopic(paidTopic)).toBe(true); // Ensure test is valid if config changes
    const paidPlan = await db
      .insert(learningPlans)
      .values({
        userId: paidUser.userId,
        topic: paidTopic,
        skillLevel: 'intermediate',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    if (!paidPlan[0]) {
      throw new Error('Failed to create paid plan');
    }

    // Compute priorities
    const freePriority = computeJobPriority({
      tier: 'free',
      isPriorityTopic: isPriorityTopic(freeTopic),
    });
    const paidPriority = computeJobPriority({
      tier: 'pro',
      isPriorityTopic: isPriorityTopic(paidTopic),
    });

    // Enqueue free job first, then paid job
    const freeJobId = await enqueueJob(
      JOB_TYPE,
      freePlan[0].id,
      freeUser.userId,
      {
        topic: freeTopic,
        notes: null,
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        startDate: null,
        deadlineDate: null,
      },
      freePriority
    );

    const paidJobId = await enqueueJob(
      JOB_TYPE,
      paidPlan[0].id,
      paidUser.userId,
      {
        topic: paidTopic,
        notes: null,
        skillLevel: 'intermediate',
        weeklyHours: 5,
        learningStyle: 'mixed',
        startDate: null,
        deadlineDate: null,
      },
      paidPriority
    );

    // Get next job - should be paid+priority despite being enqueued second
    const firstJob = await getNextJob([JOB_TYPE]);
    expect(firstJob).not.toBeNull();
    expect(firstJob?.id).toBe(paidJobId);
    expect(firstJob?.priority).toBe(paidPriority);

    // Get second job - should be free job
    const secondJob = await getNextJob([JOB_TYPE]);
    expect(secondJob).not.toBeNull();
    expect(secondJob?.id).toBe(freeJobId);
    expect(secondJob?.priority).toBe(freePriority);
  });

  it('handles retry transitions and terminal failure', async () => {
    const { plan, userId } = await createPlanFixture('retry');
    const jobId = await enqueueJob(
      JOB_TYPE,
      plan.id,
      userId,
      buildPlanGenerationPayload(plan, { topic: 'retry-topic' })
    );

    await getNextJob([JOB_TYPE]);
    const first = await failJob(jobId, 'transient error');
    expect(first?.status).toBe('pending');
    expect(first?.attempts).toBe(1);
    expect(first?.error).toBeNull();
    expect(first?.completedAt).toBeNull();

    await getNextJob([JOB_TYPE]);
    const second = await failJob(jobId, 'still failing');
    expect(second?.status).toBe('pending');
    expect(second?.attempts).toBe(2);

    await getNextJob([JOB_TYPE]);
    const terminal = await failJob(jobId, 'fatal error');
    expect(terminal?.status).toBe('failed');
    expect(terminal?.attempts).toBe(3);
    expect(terminal?.error).toBe('fatal error');
    expect(terminal?.completedAt).toBeInstanceOf(Date);
  });

  it('completes jobs and preserves attempt counter', async () => {
    const { plan, userId } = await createPlanFixture('complete');
    const jobId = await enqueueJob(
      JOB_TYPE,
      plan.id,
      userId,
      buildPlanGenerationPayload(plan, { topic: 'complete-topic' })
    );

    await getNextJob([JOB_TYPE]);
    const payload = { modulesCount: 3, tasksCount: 9, durationMs: 100 };
    const completed = await completeJob(jobId, payload);

    expect(completed?.status).toBe('completed');
    expect(completed?.attempts).toBe(0);
    expect(completed?.result).toEqual(payload);
    expect(completed?.error).toBeNull();
    expect(completed?.completedAt).toBeInstanceOf(Date);

    const duplicate = await completeJob(jobId, {
      modulesCount: 1,
      tasksCount: 1,
      durationMs: 10,
    });
    expect(duplicate?.result).toEqual(payload);
  });

  it('returns jobs by plan newest first', async () => {
    const { plan, userId } = await createPlanFixture('plan-jobs');
    const other = await createPlanFixture('plan-other');

    const jobA = await enqueueJob(
      JOB_TYPE,
      plan.id,
      userId,
      buildPlanGenerationPayload(plan, { topic: 'order-a' })
    );
    const jobB = await enqueueJob(
      JOB_TYPE,
      plan.id,
      userId,
      buildPlanGenerationPayload(plan, { topic: 'order-b' })
    );
    const jobC = await enqueueJob(
      JOB_TYPE,
      plan.id,
      userId,
      buildPlanGenerationPayload(plan, { topic: 'order-c' })
    );
    await enqueueJob(
      JOB_TYPE,
      other.plan.id,
      other.userId,
      buildPlanGenerationPayload(other.plan, { topic: 'ignore-order' })
    );

    const now = Date.now();
    await db
      .update(jobQueue)
      .set({ createdAt: new Date(now - 3000), updatedAt: new Date(now - 3000) })
      .where(eq(jobQueue.id, jobA));
    await db
      .update(jobQueue)
      .set({ createdAt: new Date(now - 2000), updatedAt: new Date(now - 2000) })
      .where(eq(jobQueue.id, jobB));
    await db
      .update(jobQueue)
      .set({ createdAt: new Date(now - 1000), updatedAt: new Date(now - 1000) })
      .where(eq(jobQueue.id, jobC));

    const jobs = await getJobsByPlanId(plan.id);
    expect(jobs.map((job) => job.id)).toEqual([jobC, jobB, jobA]);
  });

  it('counts user jobs within the provided window', async () => {
    const { plan, userId } = await createPlanFixture('rate');

    const jobRecent = await enqueueJob(
      JOB_TYPE,
      plan.id,
      userId,
      buildPlanGenerationPayload(plan, { topic: 'window-1' })
    );
    const jobOlder = await enqueueJob(
      JOB_TYPE,
      plan.id,
      userId,
      buildPlanGenerationPayload(plan, { topic: 'window-2' })
    );
    const jobOldest = await enqueueJob(
      JOB_TYPE,
      plan.id,
      userId,
      buildPlanGenerationPayload(plan, { topic: 'window-3' })
    );

    const now = new Date();

    await db
      .update(jobQueue)
      .set({ createdAt: new Date(now.getTime() - 30_000) })
      .where(eq(jobQueue.id, jobRecent));
    await db
      .update(jobQueue)
      .set({ createdAt: new Date(now.getTime() - 90_000) })
      .where(eq(jobQueue.id, jobOlder));
    await db
      .update(jobQueue)
      .set({ createdAt: new Date(now.getTime() - 5 * 60_000) })
      .where(eq(jobQueue.id, jobOldest));

    const oneMinuteAgo = new Date(now.getTime() - 60_000);
    const countsRecent = await getUserJobCount(userId, JOB_TYPE, oneMinuteAgo);
    expect(countsRecent).toBe(1);

    const threeMinutesAgo = new Date(now.getTime() - 3 * 60_000);
    const countsMid = await getUserJobCount(userId, JOB_TYPE, threeMinutesAgo);
    expect(countsMid).toBe(2);

    const future = new Date(now.getTime() + 1000);
    const countsFuture = await getUserJobCount(userId, JOB_TYPE, future);
    expect(countsFuture).toBe(0);

    const otherUser = await createPlanFixture('rate-other');
    const crossUser = await getUserJobCount(
      otherUser.userId,
      JOB_TYPE,
      oneMinuteAgo
    );
    expect(crossUser).toBe(0);

    // Ensure we did not accidentally mutate other rows during updates
    const otherRows = await db
      .select({ id: jobQueue.id })
      .from(jobQueue)
      .where(
        and(
          eq(jobQueue.userId, userId),
          lt(jobQueue.createdAt, threeMinutesAgo)
        )
      );
    expect(otherRows.map((row) => row.id)).toContain(jobOldest);
  });

  it('rejects invalid job types before query execution', async () => {
    // Deliberately bypass TS at call site to test runtime guard
    const invalidTypes = [
      'plan_generation" ) or true -- ',
    ] as unknown as JobType[];

    await expect(getNextJob(invalidTypes)).rejects.toThrow('Invalid job type');
  });
});
