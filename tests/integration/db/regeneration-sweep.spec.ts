import { claimRegenerationSweepJobIds } from '../../../workers/jobs/src/jobs/regeneration-sweep';
import { JOB_TYPES } from '@/features/jobs/types';
import { jobQueue, learningPlans } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { ensureUser } from '@tests/helpers/db/users';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

async function createPlan(userId: string) {
  const [plan] = await db
    .insert(learningPlans)
    .values({
      userId,
      topic: 'Sweep Test Plan',
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

async function insertJob(
  planId: string,
  userId: string,
  row: {
    status: 'pending' | 'processing' | 'failed';
    scheduledMinutesFromNow: number;
    updatedMinutesAgo: number;
    type?: typeof JOB_TYPES.PLAN_REGENERATION;
  },
): Promise<string> {
  const [inserted] = await db
    .insert(jobQueue)
    .values({
      jobType: row.type ?? JOB_TYPES.PLAN_REGENERATION,
      planId,
      userId,
      status: row.status,
      payload: { planId },
      scheduledFor: sql`now() + make_interval(mins => ${row.scheduledMinutesFromNow})`,
      updatedAt: sql`now() - make_interval(mins => ${row.updatedMinutesAgo})`,
    })
    .returning({ id: jobQueue.id });
  if (!inserted) {
    throw new Error('Failed to insert job fixture');
  }
  return inserted.id;
}

describe('claimRegenerationSweepJobIds', () => {
  it('selects only due pending regeneration rows untouched for 10 minutes, once', async () => {
    const userId = await ensureUser({
      authUserId: 'sweep-user',
      email: 'sweep-user@example.com',
    });
    const plan = await createPlan(userId);

    const lost = await insertJob(plan.id, userId, {
      status: 'pending',
      scheduledMinutesFromNow: -20,
      updatedMinutesAgo: 11,
    });
    await insertJob(plan.id, userId, {
      status: 'pending',
      scheduledMinutesFromNow: -20,
      updatedMinutesAgo: 5,
    });
    await insertJob(plan.id, userId, {
      status: 'pending',
      scheduledMinutesFromNow: 5,
      updatedMinutesAgo: 30,
    });
    await insertJob(plan.id, userId, {
      status: 'processing',
      scheduledMinutesFromNow: -20,
      updatedMinutesAgo: 30,
    });
    await insertJob(plan.id, userId, {
      status: 'failed',
      scheduledMinutesFromNow: -20,
      updatedMinutesAgo: 30,
    });

    await expect(claimRegenerationSweepJobIds(db)).resolves.toEqual([lost]);

    const [touched] = await db
      .select({
        recent: sql<boolean>`${jobQueue.updatedAt} > now() - interval '1 minute'`,
      })
      .from(jobQueue)
      .where(eq(jobQueue.id, lost));
    expect(touched?.recent).toBe(true);

    // The bump keeps the next tick from re-sending a row whose message is still queued.
    await expect(claimRegenerationSweepJobIds(db)).resolves.toEqual([]);
  });

  it('respects the batch limit', async () => {
    const userId = await ensureUser({
      authUserId: 'sweep-limit',
      email: 'sweep-limit@example.com',
    });
    const plan = await createPlan(userId);
    for (let index = 0; index < 3; index += 1) {
      await insertJob(plan.id, userId, {
        status: 'pending',
        scheduledMinutesFromNow: -1,
        updatedMinutesAgo: 15,
      });
    }

    await expect(claimRegenerationSweepJobIds(db, 2)).resolves.toHaveLength(2);
    await expect(claimRegenerationSweepJobIds(db, 2)).resolves.toHaveLength(1);
  });
});
