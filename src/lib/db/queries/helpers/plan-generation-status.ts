import type { DbClient, DbTransaction } from '@/lib/db/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { generationAttempts, learningPlans, users } from '@supabase/schema';
import { and, eq, ne, sql } from 'drizzle-orm';

type LearningPlanInsert = typeof learningPlans.$inferInsert;

export type PlanCapSlotState = {
  readonly isQuotaEligible: boolean;
  readonly generationStatus: LearningPlanInsert['generationStatus'];
};

// ─── Shared insert defaults ─────────────────────────────────────

/**
 * Default column values applied when a learning plan enters the `generating`
 * state for the first time (INSERT in {@link atomicCheckAndInsertPlan}).
 *
 * `isQuotaEligible` starts as `false` and flips to `true` only after
 * generation succeeds for a plan that already owns a cap reservation
 * ({@link markPlanGenerationSuccess}).
 */
export const PLAN_GENERATING_INSERT_DEFAULTS = {
  generationStatus: 'generating',
  isQuotaEligible: false,
} as const satisfies Pick<
  LearningPlanInsert,
  'generationStatus' | 'isQuotaEligible'
>;

/**
 * Per-user admission lock shared by new-plan insert and attempt reservation.
 * Namespace `1` matches `reserveAttemptSlot`.
 */
export async function lockUserPlanAdmission(
  tx: Pick<DbTransaction, 'execute'>,
  userId: string,
): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(1, hashtext(${userId}))`);
}

export async function selectUserEntitlementForAdmission(
  tx: Pick<DbClient, 'select'>,
  userId: string,
): Promise<{
  subscriptionTier: SubscriptionTier;
  initialPlanGeneratedAt: Date | null;
}> {
  const [user] = await tx
    .select({
      subscriptionTier: users.subscriptionTier,
      initialPlanGeneratedAt: users.initialPlanGeneratedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .for('update');

  if (!user) {
    throw new Error(`User not found for plan admission: ${userId}`);
  }

  return user;
}

export async function countInProgressInitialAttemptsForUser(
  tx: Pick<DbClient, 'select'>,
  params: { userId: string; excludePlanId?: string },
): Promise<number> {
  const conditions = [
    eq(learningPlans.userId, params.userId),
    eq(generationAttempts.status, 'in_progress'),
    eq(generationAttempts.generationPurpose, 'initial'),
  ];
  if (params.excludePlanId) {
    conditions.push(ne(learningPlans.id, params.excludePlanId));
  }

  const [row] = await tx
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(generationAttempts)
    .innerJoin(learningPlans, eq(generationAttempts.planId, learningPlans.id))
    .where(and(...conditions));

  const parsed = Number(row?.count ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Count plans that consume the user's plan quota (eligible + in-flight generating).
 * Accepts a DB handle or transaction for atomic check-and-insert.
 */
export async function countPlansContributingToCap(
  dbOrTx: Pick<DbClient, 'select'>,
  userId: string,
): Promise<number> {
  const [result] = await dbOrTx
    .select({
      count: sql`
        (
          count(*) FILTER (WHERE ${learningPlans.isQuotaEligible} = true)
          +
          count(*) FILTER (
            WHERE ${learningPlans.generationStatus} = 'generating'
              AND ${learningPlans.isQuotaEligible} = false
          )
        )::int
      `,
    })
    .from(learningPlans)
    .where(eq(learningPlans.userId, userId));

  const raw = result?.count;
  if (raw == null) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Eligible plans already occupy a cap slot. `generating` + ineligible is the
 * durable pending reservation created by insert or retry admission.
 */
export function planOwnsActiveCapSlot(plan: PlanCapSlotState): boolean {
  return plan.isQuotaEligible || plan.generationStatus === 'generating';
}

// ─── UPDATE helper ──────────────────────────────────────────────

type PlanStatusUpdateClient = Pick<DbClient, 'update'>;

/**
 * Transitions a learning plan to the `generating` state.
 *
 * Called from {@link reserveAttemptSlot} inside its advisory-lock
 * transaction. On the first creation attempt this is idempotent (plan is
 * already `generating` from the INSERT). On retries of ineligible plans it
 * is the durable cap reservation (`generating` + `isQuotaEligible=false`).
 *
 * Only touches `generationStatus` and `updatedAt` — callers retain full
 * control of transaction boundaries, advisory locks, and JWT claim
 * reapplication.
 */
export async function setLearningPlanGenerating(
  tx: PlanStatusUpdateClient,
  params: { planId: string; updatedAt: Date },
): Promise<void> {
  await tx
    .update(learningPlans)
    .set({
      generationStatus: 'generating',
      updatedAt: params.updatedAt,
    })
    .where(eq(learningPlans.id, params.planId));
}
