// Plan lifecycle operations — plan creation, status transitions, duration caps.
//
// Moved from features/billing/usage.ts. These functions manage the plan
// lifecycle state machine (create → generating → ready/failed) and plan
// quota enforcement. They belong in the plans domain, not in billing.

import { learningPlans, users } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
import type { PdfContext } from '@/features/pdf/context.types';
import type { DbClient } from '@/lib/db/types';
import { eq, sql } from 'drizzle-orm';

import { TIER_LIMITS } from '@/features/billing/tier-limits';
import type { SubscriptionTier } from '@/features/billing/tier-limits.types';
import { resolveUserTier } from '@/features/billing/tier';

import { PlanCreationError, PlanLimitReachedError } from '../errors';
import { UserNotFoundError } from '@/features/billing/errors';

// Explicit upgrade path mapping: current tier -> recommended next tier
const UPGRADE_PATH: Record<SubscriptionTier, SubscriptionTier> = {
  free: 'starter',
  starter: 'pro',
  pro: 'pro', // Already at highest tier
};

type PlanDurationCapResult = {
  allowed: boolean;
  reason?: string;
  upgradeUrl?: string;
};

/**
 * Check if user can create more plans
 * @returns true if user can create more plans, false otherwise
 */
export async function checkPlanLimit(
  userId: string,
  dbClient: DbClient
): Promise<boolean> {
  const tier = await resolveUserTier(userId, dbClient);
  const tierConfig = TIER_LIMITS[tier];
  if (!tierConfig) {
    throw new Error(`Unknown subscription tier: ${tier}`);
  }
  const limit = tierConfig.maxActivePlans;

  if (limit === Infinity) {
    return true;
  }

  const currentCount = await countPlansContributingToCap(dbClient, userId);
  return currentCount < limit;
}

/**
 * Count the number of plans that currently consume the user's plan quota.
 *
 * We intentionally combine two disjoint buckets to prevent over- or under-counting:
 *  - Quota-eligible plans: persisted plans that should count toward the cap
 *    (e.g. finalized/ready or manually created). These have `isQuotaEligible = true`.
 *  - In-flight generations: plans that are currently being generated so that
 *    concurrent POSTs cannot exceed the cap while the row is not yet eligible.
 *    We scope this to rows with `generationStatus = 'generating'` AND
 *    `isQuotaEligible = false` to avoid double-counting any plan that might
 *    still have a transient 'generating' status after becoming quota-eligible.
 *
 * This helper accepts a DB handle or a transaction so that callers like
 * `atomicCheckAndInsertPlan` can perform an atomic check-and-insert under a
 * single transaction/lock, ensuring correctness under concurrency.
 */
async function countPlansContributingToCap(
  dbOrTx: Pick<DbClient, 'select'>,
  userId: string
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
 * Atomically check plan limit and insert a new plan to prevent race conditions.
 * This uses a database transaction with row-level locking (SELECT FOR UPDATE)
 * to ensure that concurrent requests cannot exceed the user's plan limit.
 *
 * @param userId - The user's UUID
 * @param planData - The plan data to insert (partial learning plan record)
 * @param dbClient - Database client (defaults to runtime DB with RLS)
 * @returns The inserted plan's ID
 * @throws Error if the user has reached their plan limit
 */
export async function atomicCheckAndInsertPlan(
  userId: string,
  planData: {
    topic: string;
    skillLevel: 'beginner' | 'intermediate' | 'advanced';
    weeklyHours: number;
    learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
    visibility: 'private';
    origin: 'ai' | 'manual' | 'template' | 'pdf';
    extractedContext?: PdfContext | null;
    startDate?: string | null;
    deadlineDate?: string | null;
  },
  dbClient: DbClient
): Promise<{ id: string }> {
  return dbClient.transaction(async (tx) => {
    // Lock the user row for update to prevent concurrent limit checks
    const [user] = await tx
      .select({ subscriptionTier: users.subscriptionTier })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');

    if (!user) {
      throw new UserNotFoundError(userId);
    }

    // Read tier directly from the locked user row rather than via resolveUserTier()
    // to stay within the FOR UPDATE transaction. resolveUserTier() opens its own
    // query, which would bypass the lock and re-introduce the race condition.
    const tier = user.subscriptionTier;
    const tierConfig = TIER_LIMITS[tier];
    if (!tierConfig) {
      throw new Error(`Unknown subscription tier: ${tier}`);
    }
    const limit = tierConfig.maxActivePlans;

    if (limit !== Infinity) {
      const currentCount = await countPlansContributingToCap(tx, userId);

      if (currentCount >= limit) {
        throw new PlanLimitReachedError(currentCount, limit);
      }
    }

    const [plan] = await tx
      .insert(learningPlans)
      .values({
        userId,
        ...planData,
        generationStatus: 'generating',
        isQuotaEligible: false,
      })
      .returning({ id: learningPlans.id });

    if (!plan) {
      throw new PlanCreationError();
    }

    return plan;
  });
}

export async function markPlanGenerationSuccess(
  planId: string,
  dbClient: DbClient,
  now: () => Date = () => new Date()
): Promise<void> {
  const timestamp = now();

  const updated = await dbClient
    .update(learningPlans)
    .set({
      generationStatus: 'ready',
      isQuotaEligible: true,
      finalizedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(eq(learningPlans.id, planId))
    .returning({ id: learningPlans.id });

  if (updated.length === 0) {
    logger.warn(
      { planId },
      'markPlanGenerationSuccess: no rows updated — plan may have been deleted'
    );
  }
}

export async function markPlanGenerationFailure(
  planId: string,
  dbClient: DbClient,
  now: () => Date = () => new Date()
): Promise<void> {
  const timestamp = now();

  const updated = await dbClient
    .update(learningPlans)
    .set({
      generationStatus: 'failed',
      isQuotaEligible: false,
      updatedAt: timestamp,
    })
    .where(eq(learningPlans.id, planId))
    .returning({ id: learningPlans.id });

  if (updated.length === 0) {
    logger.warn(
      { planId },
      'markPlanGenerationFailure: no rows updated — plan may have been deleted'
    );
  }
}

export function checkPlanDurationCap(params: {
  tier: SubscriptionTier;
  weeklyHours: number;
  totalWeeks: number;
}): PlanDurationCapResult {
  const caps = TIER_LIMITS[params.tier];
  if (caps.maxWeeks !== null && params.totalWeeks > caps.maxWeeks) {
    const recommended = UPGRADE_PATH[params.tier];
    return {
      allowed: false,
      reason: `${params.tier} tier limited to ${caps.maxWeeks}-week plans. Upgrade to ${recommended} for longer plans.`,
      upgradeUrl: '/pricing',
    };
  }
  if (
    caps.maxHours !== null &&
    params.weeklyHours * params.totalWeeks > caps.maxHours
  ) {
    return {
      allowed: false,
      reason: `${params.tier} tier limited to ${caps.maxHours} total hours. Upgrade for more time.`,
      upgradeUrl: '/pricing',
    };
  }
  return { allowed: true };
}
