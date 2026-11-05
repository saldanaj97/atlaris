import { selectUserGenerationAttemptWindowStats } from '@/lib/db/queries/helpers/attempts-rate-limit';
import { deletePlan } from '@/lib/db/queries/plans';
import {
  getPlanGenerationWindowStart,
  PLAN_GENERATION_WINDOW_MS,
} from '@/shared/constants/generation';
import {
  deletedPlanGenerationAttempts,
  generationAttempts,
  learningPlans,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

const MINUTE_MS = 60_000;

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * MINUTE_MS);
}

async function createUser(label: string): Promise<string> {
  const authUserId = buildTestAuthUserId(label);
  return ensureUser({ authUserId, email: buildTestEmail(authUserId) });
}

async function createFinishedPlan(
  userId: string,
  attemptTimes: Date[],
): Promise<string> {
  const plan = await createTestPlan({ userId, generationStatus: 'ready' });
  if (attemptTimes.length === 0) return plan.id;
  await db.insert(generationAttempts).values(
    attemptTimes.map((createdAt) => ({
      planId: plan.id,
      status: 'success' as const,
      generationPurpose: 'initial' as const,
      classification: null,
      durationMs: 1,
      modulesCount: 1,
      tasksCount: 1,
      truncatedTopic: false,
      truncatedNotes: false,
      normalizedEffort: false,
      promptHash: null,
      createdAt,
    })),
  );
  return plan.id;
}

function windowStats(userId: string) {
  return selectUserGenerationAttemptWindowStats({
    userId,
    dbClient: db,
    since: getPlanGenerationWindowStart(new Date()),
  });
}

describe('deleted plan generation attempts', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser('deleted-attempts');
  });

  it('keeps counting attempts inside the window after the plan is deleted', async () => {
    const oldest = minutesAgo(30);
    const planId = await createFinishedPlan(userId, [
      oldest,
      minutesAgo(10),
      new Date(Date.now() - PLAN_GENERATION_WINDOW_MS - MINUTE_MS),
    ]);
    const before = await windowStats(userId);

    await expect(deletePlan(planId, userId, db)).resolves.toEqual({
      success: true,
    });

    expect(before.count).toBe(2);
    const after = await windowStats(userId);
    expect(after.count).toBe(2);
    expect(after.oldestAttemptCreatedAt?.getTime()).toBe(oldest.getTime());
    await expect(
      db
        .select()
        .from(deletedPlanGenerationAttempts)
        .where(eq(deletedPlanGenerationAttempts.userId, userId)),
    ).resolves.toHaveLength(2);
  });

  it('adds attempts from live and deleted plans together', async () => {
    const deletedPlanOldest = minutesAgo(40);
    const deletedPlanId = await createFinishedPlan(userId, [deletedPlanOldest]);
    await createFinishedPlan(userId, [minutesAgo(5), minutesAgo(4)]);

    await deletePlan(deletedPlanId, userId, db);

    const stats = await windowStats(userId);
    expect(stats.count).toBe(3);
    expect(stats.oldestAttemptCreatedAt?.getTime()).toBe(
      deletedPlanOldest.getTime(),
    );
  });

  it("does not count another user's deleted attempts", async () => {
    const otherUserId = await createUser('deleted-attempts-other');
    const otherPlanId = await createFinishedPlan(otherUserId, [minutesAgo(5)]);

    await deletePlan(otherPlanId, otherUserId, db);

    await expect(windowStats(userId)).resolves.toEqual({
      count: 0,
      oldestAttemptCreatedAt: null,
    });
  });

  it("prunes only the deleting user's expired rows", async () => {
    const otherUserId = await createUser('deleted-attempts-prune-other');
    const expired = new Date(
      Date.now() - PLAN_GENERATION_WINDOW_MS - MINUTE_MS,
    );
    await db.insert(deletedPlanGenerationAttempts).values([
      { userId, attemptCreatedAt: expired },
      { userId: otherUserId, attemptCreatedAt: expired },
    ]);
    const planId = await createFinishedPlan(userId, []);

    await deletePlan(planId, userId, db);

    await expect(
      db
        .select()
        .from(deletedPlanGenerationAttempts)
        .where(eq(deletedPlanGenerationAttempts.userId, userId)),
    ).resolves.toEqual([]);
    await expect(
      db
        .select()
        .from(deletedPlanGenerationAttempts)
        .where(eq(deletedPlanGenerationAttempts.userId, otherUserId)),
    ).resolves.toHaveLength(1);
  });

  it('records nothing when the delete is refused', async () => {
    const otherUserId = await createUser('deleted-attempts-not-owner');
    const planId = await createFinishedPlan(userId, [minutesAgo(5)]);

    const result = await deletePlan(planId, otherUserId, db);

    expect(result.success).toBe(false);
    await expect(
      db.select().from(deletedPlanGenerationAttempts),
    ).resolves.toEqual([]);
    await expect(
      db
        .select({ id: learningPlans.id })
        .from(learningPlans)
        .where(eq(learningPlans.id, planId)),
    ).resolves.toHaveLength(1);
  });
});
