import {
  ensureFreeAccessSelection,
  selectFreeAccessPlan,
} from '@/features/plans/entitlement/store';
import { learningPlans, users } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

describe('free-access plan selection store', () => {
  it('auto-selects the only retained plan for a Free user with a marker', async () => {
    const authUserId = buildTestAuthUserId('free-access-auto-select');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createPlan(userId, { topic: 'Only plan' });
    await db
      .update(users)
      .set({ initialPlanGeneratedAt: new Date('2026-02-01T00:00:00.000Z') })
      .where(eq(users.id, userId));

    const result = await ensureFreeAccessSelection({ userId, dbClient: db });

    expect(result.decision).toBe('auto_select');
    expect(result.snapshot.freeAccessPlanId).toBe(plan.id);
    expect(result.snapshot.freeAccessPlanSelectedAt).toBeInstanceOf(Date);
  });

  it('requires an explicit choice when two or more plans exist', async () => {
    const authUserId = buildTestAuthUserId('free-access-multi-select');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const first = await createPlan(userId, { topic: 'Plan A' });
    const second = await createPlan(userId, { topic: 'Plan B' });
    await db
      .update(users)
      .set({ initialPlanGeneratedAt: new Date('2026-02-01T00:00:00.000Z') })
      .where(eq(users.id, userId));

    const pending = await ensureFreeAccessSelection({ userId, dbClient: db });
    expect(pending.decision).toBe('selection_required');
    expect(pending.snapshot.freeAccessPlanSelectedAt).toBeNull();
    expect(pending.candidates.map((candidate) => candidate.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );

    const selected = await selectFreeAccessPlan({
      userId,
      planId: second.id,
      dbClient: db,
    });
    expect(selected.status).toBe('selected');
    if (selected.status !== 'selected') return;
    expect(selected.snapshot.freeAccessPlanId).toBe(second.id);

    const replay = await selectFreeAccessPlan({
      userId,
      planId: first.id,
      dbClient: db,
    });
    expect(replay.status).toBe('already_selected');
    if (replay.status !== 'already_selected') return;
    expect(replay.snapshot.freeAccessPlanId).toBe(second.id);
  });

  it('does not let concurrent selections choose different plans', async () => {
    const authUserId = buildTestAuthUserId('free-access-cas');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const first = await createPlan(userId, { topic: 'Race A' });
    const second = await createPlan(userId, { topic: 'Race B' });
    await db
      .update(users)
      .set({ initialPlanGeneratedAt: new Date('2026-02-01T00:00:00.000Z') })
      .where(eq(users.id, userId));

    const [left, right] = await Promise.all([
      selectFreeAccessPlan({ userId, planId: first.id, dbClient: db }),
      selectFreeAccessPlan({ userId, planId: second.id, dbClient: db }),
    ]);

    const statuses = [left.status, right.status].sort();
    expect(statuses).toEqual(['already_selected', 'selected']);

    const [row] = await db
      .select({
        freeAccessPlanId: users.freeAccessPlanId,
        freeAccessPlanSelectedAt: users.freeAccessPlanSelectedAt,
      })
      .from(users)
      .where(eq(users.id, userId));
    expect(row?.freeAccessPlanSelectedAt).toBeInstanceOf(Date);
    expect([first.id, second.id]).toContain(row?.freeAccessPlanId);

    const leftover = await db
      .select({ id: learningPlans.id })
      .from(learningPlans)
      .where(eq(learningPlans.userId, userId));
    expect(leftover).toHaveLength(2);
  });

  it('returns invalid_candidate when the plan is not owned', async () => {
    const ownerAuthId = buildTestAuthUserId('free-access-owner');
    const ownerId = await ensureUser({
      authUserId: ownerAuthId,
      email: buildTestEmail(ownerAuthId),
      subscriptionTier: 'free',
    });
    const strangerAuthId = buildTestAuthUserId('free-access-stranger');
    const strangerId = await ensureUser({
      authUserId: strangerAuthId,
      email: buildTestEmail(strangerAuthId),
      subscriptionTier: 'free',
    });
    const owned = await createPlan(ownerId, { topic: 'Someone else' });
    await db
      .update(users)
      .set({ initialPlanGeneratedAt: new Date('2026-02-01T00:00:00.000Z') })
      .where(eq(users.id, strangerId));

    const result = await selectFreeAccessPlan({
      userId: strangerId,
      planId: owned.id,
      dbClient: db,
    });
    expect(result.status).toBe('invalid_candidate');
  });

  it('ignores failed ineligible placeholders when auto-selecting', async () => {
    const authUserId = buildTestAuthUserId('free-access-skip-failed');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    await createPlan(userId, {
      topic: 'Failed placeholder',
      generationStatus: 'failed',
      isQuotaEligible: false,
      finalizedAt: null,
    });
    const eligible = await createPlan(userId, { topic: 'Ready plan' });
    await db
      .update(users)
      .set({ initialPlanGeneratedAt: new Date('2026-02-01T00:00:00.000Z') })
      .where(eq(users.id, userId));

    const result = await ensureFreeAccessSelection({ userId, dbClient: db });

    expect(result.decision).toBe('auto_select');
    expect(result.candidates.map((candidate) => candidate.id)).toEqual([
      eligible.id,
    ]);
    expect(result.snapshot.freeAccessPlanId).toBe(eligible.id);
  });

  it('rejects selecting a failed ineligible plan', async () => {
    const authUserId = buildTestAuthUserId('free-access-invalid-failed');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const failed = await createPlan(userId, {
      topic: 'Failed placeholder',
      generationStatus: 'failed',
      isQuotaEligible: false,
      finalizedAt: null,
    });
    await createPlan(userId, { topic: 'Ready plan' });
    await db
      .update(users)
      .set({ initialPlanGeneratedAt: new Date('2026-02-01T00:00:00.000Z') })
      .where(eq(users.id, userId));

    const result = await selectFreeAccessPlan({
      userId,
      planId: failed.id,
      dbClient: db,
    });
    expect(result.status).toBe('invalid_candidate');
  });
});
