import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { jobQueue, learningPlans } from '@/lib/db/schema';
import {
  completeJob,
  enqueueJob,
  failJob,
  getJobsByPlanId,
  getNextJob,
} from '@/lib/jobs/queue';
import { ensureUser } from '../helpers/db';

const JOB_TYPE = 'plan_generation';

async function createPlanForUser(clerkUserId: string) {
  const userId = await ensureUser({
    clerkUserId,
    email: `${clerkUserId}@example.com`,
  });

  const [plan] = await db
    .insert(learningPlans)
    .values({
      userId,
      topic: 'Async background jobs',
      skillLevel: 'beginner',
      weeklyHours: 4,
      learningStyle: 'reading',
    })
    .returning({ id: learningPlans.id });

  if (!plan?.id) throw new Error('Failed to create plan');
  return { userId, planId: plan.id };
}

describe('Job queue service operations', () => {
  it('enqueueJob inserts expected defaults (T002)', async () => {
    const { userId, planId } = await createPlanForUser('enqueue-defaults');

    const payload = { topic: 'Context', notes: 'test' };
    const jobId = await enqueueJob(JOB_TYPE, planId, userId, payload);

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
  });

  it('getNextJob locks a single job per worker (T003)', async () => {
    const { userId, planId } = await createPlanForUser('locking');

    const jobIds = await Promise.all([
      enqueueJob(JOB_TYPE, planId, userId, { job: 1 }),
      enqueueJob(JOB_TYPE, planId, userId, { job: 2 }),
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

    const [firstRecord] = await db
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.id, first!.id));
    const [secondRecord] = await db
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.id, second!.id));

    expect(firstRecord?.status).toBe('processing');
    expect(firstRecord?.startedAt).toBeInstanceOf(Date);
    expect(secondRecord?.status).toBe('processing');
    expect(secondRecord?.startedAt).toBeInstanceOf(Date);
  });

  it('respects priority and FIFO ordering (T004)', async () => {
    const { userId, planId } = await createPlanForUser('priority');

    const firstFive = await enqueueJob(JOB_TYPE, planId, userId, { order: 1 }, 5);
    const zeroPriority = await enqueueJob(
      JOB_TYPE,
      planId,
      userId,
      { order: 2 },
      0
    );
    const secondFive = await enqueueJob(
      JOB_TYPE,
      planId,
      userId,
      { order: 3 },
      5
    );
    const highPriority = await enqueueJob(
      JOB_TYPE,
      planId,
      userId,
      { order: 4 },
      10
    );

    const processed = [] as Array<{ id: string; priority: number }>;
    for (let i = 0; i < 4; i += 1) {
      const job = await getNextJob([JOB_TYPE]);
      expect(job).not.toBeNull();
      processed.push({ id: job!.id, priority: job!.priority });
    }

    expect(processed.map((item) => item.priority)).toEqual([10, 5, 5, 0]);

    const priorityFiveOrder = processed
      .filter((item) => item.priority === 5)
      .map((item) => item.id);

    expect(priorityFiveOrder).toEqual([firstFive, secondFive]);
    expect(processed.at(-1)?.id).toBe(zeroPriority);
    expect(processed[0]?.id).toBe(highPriority);
  });

  it('handles retries and terminal failure transitions (T005)', async () => {
    const { userId, planId } = await createPlanForUser('retries');
    const jobId = await enqueueJob(JOB_TYPE, planId, userId, { retry: true });

    // First attempt -> fail -> should reset to pending
    await getNextJob([JOB_TYPE]);
    const firstFailure = await failJob(jobId, 'transient error');
    expect(firstFailure?.status).toBe('pending');
    expect(firstFailure?.attempts).toBe(1);
    expect(firstFailure?.error).toBeNull();
    expect(firstFailure?.completedAt).toBeNull();

    // Second attempt -> still pending after failure
    await getNextJob([JOB_TYPE]);
    const secondFailure = await failJob(jobId, 'still failing');
    expect(secondFailure?.status).toBe('pending');
    expect(secondFailure?.attempts).toBe(2);

    // Third attempt -> exceed retries -> failed state persists error + completedAt
    await getNextJob([JOB_TYPE]);
    const terminalFailure = await failJob(jobId, 'fatal');
    expect(terminalFailure?.status).toBe('failed');
    expect(terminalFailure?.attempts).toBe(3);
    expect(terminalFailure?.error).toBe('fatal');
    expect(terminalFailure?.completedAt).toBeInstanceOf(Date);
  });

  it('marks jobs as completed without altering attempts (T006)', async () => {
    const { userId, planId } = await createPlanForUser('complete');
    const jobId = await enqueueJob(JOB_TYPE, planId, userId, { complete: true });

    await getNextJob([JOB_TYPE]);
    const resultPayload = { modulesCount: 3 };
    const completed = await completeJob(jobId, resultPayload);
    expect(completed?.status).toBe('completed');
    expect(completed?.attempts).toBe(0);
    expect(completed?.result).toEqual(resultPayload);
    expect(completed?.completedAt).toBeInstanceOf(Date);
    expect(completed?.error).toBeNull();
  });

  it('guards against duplicate completion attempts (T007)', async () => {
    const { userId, planId } = await createPlanForUser('completion-guard');
    const jobId = await enqueueJob(JOB_TYPE, planId, userId, { guard: true });

    await getNextJob([JOB_TYPE]);
    const first = await completeJob(jobId, { value: 1 });
    const second = await completeJob(jobId, { value: 2 });

    expect(first?.status).toBe('completed');
    expect(second?.status).toBe('completed');
    expect(second?.result).toEqual(first?.result);
    expect(second?.completedAt?.getTime()).toBe(first?.completedAt?.getTime());
  });

  it('returns jobs newest first for plan lookup (T008)', async () => {
    const { userId, planId } = await createPlanForUser('plan-jobs');
    const otherPlan = await createPlanForUser('other-plan');

    const jobA = await enqueueJob(JOB_TYPE, planId, userId, { order: 'A' });
    const jobB = await enqueueJob(JOB_TYPE, planId, userId, { order: 'B' });
    const jobC = await enqueueJob(JOB_TYPE, planId, userId, { order: 'C' });
    await enqueueJob(JOB_TYPE, otherPlan.planId, otherPlan.userId, { ignore: true });

    // Force deterministic created_at ordering
    const timestamps = [1, 2, 3].map(
      (offset) => new Date(Date.now() - offset * 1000)
    );
    await db
      .update(jobQueue)
      .set({ createdAt: timestamps[2] })
      .where(eq(jobQueue.id, jobA));
    await db
      .update(jobQueue)
      .set({ createdAt: timestamps[1] })
      .where(eq(jobQueue.id, jobB));
    await db
      .update(jobQueue)
      .set({ createdAt: timestamps[0] })
      .where(eq(jobQueue.id, jobC));

    const jobs = await getJobsByPlanId(planId);

    expect(jobs.map((job) => job.id)).toEqual([jobC, jobB, jobA]);
    for (const job of jobs) {
      expect(job.planId).toBe(planId);
    }
  });
});
