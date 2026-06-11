import {
  cleanupOrphanedAttempts,
  cleanupStuckPlans,
  ORPHANED_ATTEMPT_THRESHOLD_MS,
  STUCK_PLAN_THRESHOLD_MS,
} from '@/features/plans/cleanup';
import { generationAttempts, learningPlans } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestPlan } from '@tests/fixtures/plans';
import { createTestUser } from '@tests/fixtures/users';
import { eq, inArray } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

describe('cleanupStuckPlans (integration)', () => {
  it('marks only old generating plans failed with a shared timestamp', async () => {
    const user = await createTestUser();
    const thresholdMs = STUCK_PLAN_THRESHOLD_MS;
    const stuckCutoff = new Date(Date.now() - thresholdMs - 60_000);
    const recentCutoff = new Date(Date.now() - 60_000);

    const stuckOne = await createTestPlan({
      userId: user.id,
      topic: 'Stuck one',
      generationStatus: 'generating',
      isQuotaEligible: true,
    });
    const stuckTwo = await createTestPlan({
      userId: user.id,
      topic: 'Stuck two',
      generationStatus: 'generating',
      isQuotaEligible: true,
    });
    const recentGenerating = await createTestPlan({
      userId: user.id,
      topic: 'Recent generating',
      generationStatus: 'generating',
      isQuotaEligible: false,
    });
    const oldReady = await createTestPlan({
      userId: user.id,
      topic: 'Old ready',
      generationStatus: 'ready',
      isQuotaEligible: true,
    });
    const oldFailed = await createTestPlan({
      userId: user.id,
      topic: 'Old failed',
      generationStatus: 'failed',
      isQuotaEligible: false,
    });

    await db
      .update(learningPlans)
      .set({ updatedAt: stuckCutoff })
      .where(inArray(learningPlans.id, [stuckOne.id, stuckTwo.id]));

    await db
      .update(learningPlans)
      .set({ updatedAt: recentCutoff })
      .where(
        inArray(learningPlans.id, [
          recentGenerating.id,
          oldReady.id,
          oldFailed.id,
        ]),
      );

    const result = await cleanupStuckPlans(db, thresholdMs);

    expect(result.cleaned).toBe(2);

    const rows = await db
      .select({
        id: learningPlans.id,
        generationStatus: learningPlans.generationStatus,
        isQuotaEligible: learningPlans.isQuotaEligible,
        updatedAt: learningPlans.updatedAt,
      })
      .from(learningPlans)
      .where(
        inArray(learningPlans.id, [
          stuckOne.id,
          stuckTwo.id,
          recentGenerating.id,
          oldReady.id,
          oldFailed.id,
        ]),
      );

    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get(stuckOne.id)).toMatchObject({
      generationStatus: 'failed',
      isQuotaEligible: false,
    });
    expect(byId.get(stuckTwo.id)).toMatchObject({
      generationStatus: 'failed',
      isQuotaEligible: false,
    });
    expect(byId.get(stuckOne.id)?.updatedAt?.toISOString()).toBe(
      byId.get(stuckTwo.id)?.updatedAt?.toISOString(),
    );

    expect(byId.get(recentGenerating.id)).toMatchObject({
      generationStatus: 'generating',
      isQuotaEligible: false,
    });
    expect(byId.get(oldReady.id)).toMatchObject({
      generationStatus: 'ready',
      isQuotaEligible: true,
    });
    expect(byId.get(oldFailed.id)).toMatchObject({
      generationStatus: 'failed',
      isQuotaEligible: false,
    });
  });

  it('returns 0 when no stuck generating plans exist', async () => {
    const user = await createTestUser();
    const plan = await createTestPlan({
      userId: user.id,
      generationStatus: 'generating',
    });

    await db
      .update(learningPlans)
      .set({ updatedAt: new Date() })
      .where(eq(learningPlans.id, plan.id));

    const result = await cleanupStuckPlans(db);

    expect(result.cleaned).toBe(0);

    const [row] = await db
      .select({ generationStatus: learningPlans.generationStatus })
      .from(learningPlans)
      .where(eq(learningPlans.id, plan.id));

    expect(row?.generationStatus).toBe('generating');
  });
});

describe('cleanupOrphanedAttempts (integration)', () => {
  it('finalizes stale in_progress attempts and leaves recent attempts untouched', async () => {
    const user = await createTestUser();
    const staleCutoff = new Date(
      Date.now() - ORPHANED_ATTEMPT_THRESHOLD_MS - 60_000,
    );
    const recentCutoff = new Date(Date.now() - 60_000);

    const stalePlan = await createTestPlan({
      userId: user.id,
      topic: 'Stale attempt plan',
    });
    const recentPlan = await createTestPlan({
      userId: user.id,
      topic: 'Recent attempt plan',
    });

    const [staleAttempt] = await db
      .insert(generationAttempts)
      .values({
        planId: stalePlan.id,
        status: 'in_progress',
        classification: null,
        durationMs: 0,
        modulesCount: 0,
        tasksCount: 0,
      })
      .returning();
    const [recentAttempt] = await db
      .insert(generationAttempts)
      .values({
        planId: recentPlan.id,
        status: 'in_progress',
        classification: null,
        durationMs: 0,
        modulesCount: 0,
        tasksCount: 0,
      })
      .returning();

    await db
      .update(generationAttempts)
      .set({ createdAt: staleCutoff })
      .where(eq(generationAttempts.id, staleAttempt.id));
    await db
      .update(generationAttempts)
      .set({ createdAt: recentCutoff })
      .where(eq(generationAttempts.id, recentAttempt.id));

    const result = await cleanupOrphanedAttempts(db);

    expect(result.cleaned).toBe(1);

    const rows = await db
      .select({
        id: generationAttempts.id,
        status: generationAttempts.status,
        classification: generationAttempts.classification,
      })
      .from(generationAttempts)
      .where(
        inArray(generationAttempts.id, [staleAttempt.id, recentAttempt.id]),
      );

    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(staleAttempt.id)).toMatchObject({
      status: 'failure',
      classification: 'timeout',
    });
    expect(byId.get(recentAttempt.id)).toMatchObject({
      status: 'in_progress',
      classification: null,
    });
  });

  it('returns 0 when no orphaned in_progress attempts exist', async () => {
    const user = await createTestUser();
    const plan = await createTestPlan({ userId: user.id });
    const recentCutoff = new Date(Date.now() - 60_000);

    const [attempt] = await db
      .insert(generationAttempts)
      .values({
        planId: plan.id,
        status: 'in_progress',
        classification: null,
        durationMs: 0,
        modulesCount: 0,
        tasksCount: 0,
      })
      .returning();

    await db
      .update(generationAttempts)
      .set({ createdAt: recentCutoff })
      .where(eq(generationAttempts.id, attempt.id));

    const result = await cleanupOrphanedAttempts(db);

    expect(result.cleaned).toBe(0);
  });

  it('processes only one bounded batch per run', async () => {
    const user = await createTestUser();
    const staleCutoff = new Date(
      Date.now() - ORPHANED_ATTEMPT_THRESHOLD_MS - 60_000,
    );
    const attemptIds: string[] = [];

    for (let index = 0; index < 3; index += 1) {
      const plan = await createTestPlan({
        userId: user.id,
        topic: `Stale attempt plan ${index}`,
      });
      const [attempt] = await db
        .insert(generationAttempts)
        .values({
          planId: plan.id,
          status: 'in_progress',
          classification: null,
          durationMs: 0,
          modulesCount: 0,
          tasksCount: 0,
        })
        .returning();
      await db
        .update(generationAttempts)
        .set({ createdAt: staleCutoff })
        .where(eq(generationAttempts.id, attempt.id));
      attemptIds.push(attempt.id);
    }

    const result = await cleanupOrphanedAttempts(db, undefined, {
      batchSize: 2,
    });

    expect(result.cleaned).toBe(2);

    const rows = await db
      .select({
        id: generationAttempts.id,
        status: generationAttempts.status,
        classification: generationAttempts.classification,
      })
      .from(generationAttempts)
      .where(inArray(generationAttempts.id, attemptIds));

    const finalized = rows.filter((row) => row.classification === 'timeout');
    const stillInProgress = rows.filter(
      (row) => row.status === 'in_progress' && row.classification === null,
    );

    expect(finalized).toHaveLength(2);
    expect(stillInProgress).toHaveLength(1);
  });
});
