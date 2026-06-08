import {
  cleanupStuckPlans,
  STUCK_PLAN_THRESHOLD_MS,
} from '@/features/plans/cleanup';
import { learningPlans } from '@supabase/schema';
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
