import {
  generationAttempts,
  learningPlans,
  usageMetrics,
  users,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

type EntitlementRow = {
  initialPlanGeneratedAt: Date | null;
  freeAccessPlanId: string | null;
  freeAccessPlanSelectedAt: Date | null;
};

async function runEntitlementBackfill(): Promise<void> {
  await db.execute(sql`SELECT private.backfill_user_entitlement_fields()`);
}

async function readEntitlements(userId: string): Promise<EntitlementRow> {
  const [row] = await db
    .select({
      initialPlanGeneratedAt: users.initialPlanGeneratedAt,
      freeAccessPlanId: users.freeAccessPlanId,
      freeAccessPlanSelectedAt: users.freeAccessPlanSelectedAt,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!row) {
    throw new Error(`Expected user ${userId} to exist`);
  }

  return row;
}

async function insertReadyAiPlan(
  userId: string,
  topic: string,
  finalizedAt: Date,
): Promise<{ id: string }> {
  return createTestPlan({
    userId,
    topic,
    origin: 'ai',
    generationStatus: 'ready',
    isQuotaEligible: true,
    finalizedAt,
  });
}

describe('user lifetime entitlement fields', () => {
  it('adds nullable entitlement columns without extra indexes', async () => {
    const rows = (await db.execute(sql`
      SELECT column_name, data_type, is_nullable, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name IN (
          'initial_plan_generated_at',
          'free_access_plan_id',
          'free_access_plan_selected_at'
        )
      ORDER BY column_name
    `)) as Array<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      udt_name: string;
    }>;

    expect(rows).toEqual([
      {
        column_name: 'free_access_plan_id',
        data_type: 'uuid',
        is_nullable: 'YES',
        udt_name: 'uuid',
      },
      {
        column_name: 'free_access_plan_selected_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
        udt_name: 'timestamptz',
      },
      {
        column_name: 'initial_plan_generated_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
        udt_name: 'timestamptz',
      },
    ]);

    const indexRows = (await db.execute(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'users'
        AND (
          indexdef ILIKE '%initial_plan_generated_at%'
          OR indexdef ILIKE '%free_access_plan_id%'
          OR indexdef ILIKE '%free_access_plan_selected_at%'
        )
    `)) as Array<{ indexname: string }>;
    expect(indexRows).toEqual([]);
  });

  it('clears free_access_plan_id on plan delete and preserves selected_at', async () => {
    const authUserId = buildTestAuthUserId('entitlement-fk-delete');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const selectedAt = new Date('2026-03-04T15:00:00.000Z');
    const plan = await insertReadyAiPlan(
      userId,
      'FK delete plan',
      new Date('2026-03-01T00:00:00.000Z'),
    );

    await db
      .update(users)
      .set({
        initialPlanGeneratedAt: new Date('2026-03-01T00:00:00.000Z'),
        freeAccessPlanId: plan.id,
        freeAccessPlanSelectedAt: selectedAt,
      })
      .where(eq(users.id, userId));

    await db.delete(learningPlans).where(eq(learningPlans.id, plan.id));

    const afterDelete = await readEntitlements(userId);
    expect(afterDelete.freeAccessPlanId).toBeNull();
    expect(afterDelete.freeAccessPlanSelectedAt).toEqual(selectedAt);
    expect(afterDelete.initialPlanGeneratedAt).toEqual(
      new Date('2026-03-01T00:00:00.000Z'),
    );
  });

  it('backfills earliest AI success regardless of tier and leaves paid selection pending', async () => {
    const earlier = new Date('2026-01-10T08:00:00.000Z');
    const later = new Date('2026-02-20T08:00:00.000Z');

    const freeAuth = buildTestAuthUserId('entitlement-free-one');
    const freeUserId = await ensureUser({
      authUserId: freeAuth,
      email: buildTestEmail(freeAuth),
      subscriptionTier: 'free',
    });
    const freePlan = await insertReadyAiPlan(
      freeUserId,
      'Free single',
      earlier,
    );

    const multiAuth = buildTestAuthUserId('entitlement-free-multi');
    const multiUserId = await ensureUser({
      authUserId: multiAuth,
      email: buildTestEmail(multiAuth),
      subscriptionTier: 'free',
    });
    await insertReadyAiPlan(multiUserId, 'Free first', earlier);
    await insertReadyAiPlan(multiUserId, 'Free second', later);

    const paidAuth = buildTestAuthUserId('entitlement-paid');
    const paidUserId = await ensureUser({
      authUserId: paidAuth,
      email: buildTestEmail(paidAuth),
      subscriptionTier: 'pro',
    });
    await insertReadyAiPlan(paidUserId, 'Paid success', later);

    const regenAuth = buildTestAuthUserId('entitlement-regen');
    const regenUserId = await ensureUser({
      authUserId: regenAuth,
      email: buildTestEmail(regenAuth),
      subscriptionTier: 'starter',
    });
    const regenerated = await insertReadyAiPlan(
      regenUserId,
      'Regenerated plan',
      later,
    );
    await db.insert(generationAttempts).values({
      planId: regenerated.id,
      status: 'success',
      durationMs: 1,
      modulesCount: 1,
      tasksCount: 1,
      truncatedTopic: false,
      truncatedNotes: false,
      normalizedEffort: false,
      createdAt: earlier,
    });

    await runEntitlementBackfill();

    const freeEntitlement = await readEntitlements(freeUserId);
    expect(freeEntitlement.initialPlanGeneratedAt).toEqual(earlier);
    expect(freeEntitlement.freeAccessPlanId).toBe(freePlan.id);
    expect(freeEntitlement.freeAccessPlanSelectedAt).toBeInstanceOf(Date);

    const multiEntitlement = await readEntitlements(multiUserId);
    expect(multiEntitlement.initialPlanGeneratedAt).toEqual(earlier);
    expect(multiEntitlement.freeAccessPlanId).toBeNull();
    expect(multiEntitlement.freeAccessPlanSelectedAt).toBeNull();

    const paidEntitlement = await readEntitlements(paidUserId);
    expect(paidEntitlement.initialPlanGeneratedAt).toEqual(later);
    expect(paidEntitlement.freeAccessPlanId).toBeNull();
    expect(paidEntitlement.freeAccessPlanSelectedAt).toBeNull();

    const regenEntitlement = await readEntitlements(regenUserId);
    expect(regenEntitlement.initialPlanGeneratedAt).toEqual(earlier);
    expect(regenEntitlement.freeAccessPlanId).toBeNull();
    expect(regenEntitlement.freeAccessPlanSelectedAt).toBeNull();
  });

  it('grandfathers deleted-only or counter-only history and ignores non-AI evidence', async () => {
    const counterAuth = buildTestAuthUserId('entitlement-counter');
    const counterUserId = await ensureUser({
      authUserId: counterAuth,
      email: buildTestEmail(counterAuth),
      subscriptionTier: 'free',
    });
    await db.insert(usageMetrics).values({
      userId: counterUserId,
      month: '2026-01',
      plansGenerated: 3,
    });

    const failedAuth = buildTestAuthUserId('entitlement-failed');
    const failedUserId = await ensureUser({
      authUserId: failedAuth,
      email: buildTestEmail(failedAuth),
      subscriptionTier: 'free',
    });
    await createTestPlan({
      userId: failedUserId,
      topic: 'Never finalized',
      origin: 'ai',
      generationStatus: 'failed',
      isQuotaEligible: false,
      finalizedAt: null,
    });

    const templateAuth = buildTestAuthUserId('entitlement-template');
    const templateUserId = await ensureUser({
      authUserId: templateAuth,
      email: buildTestEmail(templateAuth),
      subscriptionTier: 'free',
    });
    await createTestPlan({
      userId: templateUserId,
      topic: 'Manual only',
      origin: 'manual',
      generationStatus: 'ready',
      isQuotaEligible: true,
      finalizedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const deletedAuth = buildTestAuthUserId('entitlement-deleted');
    const deletedUserId = await ensureUser({
      authUserId: deletedAuth,
      email: buildTestEmail(deletedAuth),
      subscriptionTier: 'free',
    });
    const doomed = await insertReadyAiPlan(
      deletedUserId,
      'About to delete',
      new Date('2026-01-15T00:00:00.000Z'),
    );
    await db.delete(learningPlans).where(eq(learningPlans.id, doomed.id));

    await runEntitlementBackfill();

    await expect(readEntitlements(counterUserId)).resolves.toEqual({
      initialPlanGeneratedAt: null,
      freeAccessPlanId: null,
      freeAccessPlanSelectedAt: null,
    });
    await expect(readEntitlements(failedUserId)).resolves.toEqual({
      initialPlanGeneratedAt: null,
      freeAccessPlanId: null,
      freeAccessPlanSelectedAt: null,
    });
    await expect(readEntitlements(templateUserId)).resolves.toEqual({
      initialPlanGeneratedAt: null,
      freeAccessPlanId: null,
      freeAccessPlanSelectedAt: null,
    });
    await expect(readEntitlements(deletedUserId)).resolves.toEqual({
      initialPlanGeneratedAt: null,
      freeAccessPlanId: null,
      freeAccessPlanSelectedAt: null,
    });
  });

  it('is a no-op on a second backfill execution', async () => {
    const authUserId = buildTestAuthUserId('entitlement-idempotent');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const firstFinalizedAt = new Date('2026-04-01T00:00:00.000Z');
    const plan = await insertReadyAiPlan(
      userId,
      'Idempotent plan',
      firstFinalizedAt,
    );

    await runEntitlementBackfill();
    const first = await readEntitlements(userId);
    expect(first.freeAccessPlanId).toBe(plan.id);
    expect(first.initialPlanGeneratedAt).toEqual(firstFinalizedAt);

    await insertReadyAiPlan(
      userId,
      'Later extra plan',
      new Date('2025-01-01T00:00:00.000Z'),
    );

    await runEntitlementBackfill();
    const second = await readEntitlements(userId);

    expect(second.initialPlanGeneratedAt).toEqual(first.initialPlanGeneratedAt);
    expect(second.freeAccessPlanId).toBe(first.freeAccessPlanId);
    expect(second.freeAccessPlanSelectedAt).toEqual(
      first.freeAccessPlanSelectedAt,
    );
  });

  it('records SET NULL delete behavior on the free-access plan foreign key', async () => {
    const constraints = (await db.execute(sql`
      SELECT conname, confdeltype
      FROM pg_constraint
      WHERE conrelid = 'public.users'::regclass
        AND contype = 'f'
        AND conname = 'users_free_access_plan_id_learning_plans_id_fk'
    `)) as Array<{ conname: string; confdeltype: string }>;

    expect(constraints).toEqual([
      {
        conname: 'users_free_access_plan_id_learning_plans_id_fk',
        confdeltype: 'n',
      },
    ]);
  });
});
