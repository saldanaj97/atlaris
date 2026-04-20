// Plan lifecycle: creation, status transitions, duration caps, and quota enforcement.

import { and, eq, gte, sql } from 'drizzle-orm';
import { selectUserSubscriptionTierForUpdate } from '@/features/billing/metered-reservation';
import { resolveUserTier } from '@/features/billing/tier';
import { TIER_LIMITS } from '@/features/billing/tier-limits';
import { PLAN_GENERATING_INSERT_DEFAULTS } from '@/lib/db/queries/helpers/plan-generation-status';
import { learningPlans } from '@/lib/db/schema';
import type { DbClient } from '@/lib/db/types';
import { logger } from '@/lib/logging/logger';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import { PlanCreationError, PlanLimitReachedError } from '../errors';

/** Window (in seconds) for detecting duplicate plan submissions. */
const DUPLICATE_DETECTION_WINDOW_SECONDS = 60;

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

type PlanWriteClient = Pick<DbClient, 'update'>;

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
    origin: 'ai' | 'manual' | 'template';
    startDate?: string | null;
    deadlineDate?: string | null;
  },
  dbClient: DbClient
): Promise<{ id: string }> {
  return dbClient.transaction(async (tx) => {
    const user = await selectUserSubscriptionTierForUpdate(tx, userId);

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
        ...PLAN_GENERATING_INSERT_DEFAULTS,
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
  dbClient: PlanWriteClient,
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
  dbClient: PlanWriteClient,
  // Accept a clock supplier so callers can share one timestamp across a batch.
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

/**
 * Find a recent plan with the same normalized topic for the given user.
 * Used for duplicate/idempotent submission detection.
 *
 * Matches plans created within the dedup window that are still active
 * (generating or ready), using case-insensitive topic comparison.
 */
export async function findRecentDuplicatePlan(
  userId: string,
  normalizedTopic: string,
  dbClient: DbClient
): Promise<string | null> {
  const windowStart = new Date(
    Date.now() - DUPLICATE_DETECTION_WINDOW_SECONDS * 1000
  );

  const [row] = await dbClient
    .select({ id: learningPlans.id })
    .from(learningPlans)
    .where(
      and(
        eq(learningPlans.userId, userId),
        sql`lower(${learningPlans.topic}) = lower(${normalizedTopic})`,
        gte(learningPlans.createdAt, windowStart),
        sql`${learningPlans.generationStatus} IN ('generating', 'ready')`
      )
    )
    .limit(1);

  return row?.id ?? null;
}
