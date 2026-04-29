import { ValidationError } from '@/lib/api/errors';
import { getDb } from '@/lib/db/runtime';
import { learningPlans, usageMetrics } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
import { TIER_LIMITS } from '@/shared/constants/tier-limits';
import { and, eq, sql } from 'drizzle-orm';
import { UsageMetricsLoadError } from './errors';
import { resolveUserTier } from './tier';

import type { DbClient } from '@/lib/db/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

// Usage type for incrementing counters
type UsageType = 'plan' | 'regeneration' | 'export';

export type UsageSummary = {
  tier: SubscriptionTier;
  activePlans: {
    current: number;
    limit: number;
  };
  regenerations: {
    used: number;
    limit: number;
  };
  exports: {
    used: number;
    limit: number;
  };
};

/**
 * Get current month in YYYY-MM format
 */
export function getCurrentMonth(now?: Date): string {
  const d = now ?? new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get or create usage metrics for current month
 */
async function getOrCreateUsageMetrics(
  userId: string,
  month: string,
  dbClient: DbClient = getDb(),
) {
  const [created] = await dbClient
    .insert(usageMetrics)
    .values({
      userId,
      month,
      plansGenerated: 0,
      regenerationsUsed: 0,
      exportsUsed: 0,
    })
    .onConflictDoNothing({
      target: [usageMetrics.userId, usageMetrics.month],
    })
    .returning();

  if (created) {
    return created;
  }

  const [existing] = await dbClient
    .select()
    .from(usageMetrics)
    .where(and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)))
    .limit(1);

  if (!existing) {
    throw new UsageMetricsLoadError(userId, month);
  }

  return existing;
}

/**
 * Increment usage counter for the current month
 */
export async function incrementUsage(
  userId: string,
  type: UsageType,
  dbClient: DbClient = getDb(),
): Promise<void> {
  const month = getCurrentMonth();

  // Ensure metrics exist for this month
  await getOrCreateUsageMetrics(userId, month, dbClient);

  // Increment the appropriate counter based on type
  const updateObj =
    type === 'plan'
      ? { plansGenerated: sql`${usageMetrics.plansGenerated} + 1` }
      : type === 'regeneration'
        ? { regenerationsUsed: sql`${usageMetrics.regenerationsUsed} + 1` }
        : { exportsUsed: sql`${usageMetrics.exportsUsed} + 1` };

  // Increment the counter
  await dbClient
    .update(usageMetrics)
    .set({
      ...updateObj,
      updatedAt: new Date(),
    })
    .where(and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)));
}

/**
 * Get usage summary for a user whose tier has already been resolved.
 *
 * Caller contract: `tier` MUST come from the same `users` row as this request
 * (e.g. read alongside the billing projection in `getBillingAccountSnapshot`).
 * Passing a stale or unrelated tier will silently yield the wrong limits.
 *
 * Prefer `getUsageSummary` for callers that do not already have a resolved tier.
 */
export async function getUsageSummaryForTier(args: {
  userId: string;
  tier: SubscriptionTier;
  dbClient?: DbClient;
}): Promise<UsageSummary> {
  const { userId, tier, dbClient = getDb() } = args;
  const limits = TIER_LIMITS[tier as keyof typeof TIER_LIMITS];
  if (limits === undefined) {
    logger.info(
      { userId, tier },
      '[getUsageSummaryForTier] audit: invalid subscription tier for usage limits',
    );
    throw new ValidationError('Invalid subscription tier for usage limits', {
      userId,
      tier,
    });
  }
  const month = getCurrentMonth();
  const metrics = await getOrCreateUsageMetrics(userId, month, dbClient);

  const [planCount] = await dbClient
    .select({ count: sql`count(*)::int` })
    .from(learningPlans)
    .where(
      and(
        eq(learningPlans.userId, userId),
        eq(learningPlans.isQuotaEligible, true),
      ),
    );

  return {
    tier,
    activePlans: {
      current: (planCount?.count as number) ?? 0,
      limit: limits.maxActivePlans,
    },
    regenerations: {
      used: metrics.regenerationsUsed,
      limit: limits.monthlyRegenerations,
    },
    exports: {
      used: metrics.exportsUsed,
      limit: limits.monthlyExports,
    },
  };
}

/**
 * Get usage summary for a user; auto-resolves tier from the `users` row.
 */
export async function getUsageSummary(
  userId: string,
  dbClient: DbClient = getDb(),
): Promise<UsageSummary> {
  const tier = await resolveUserTier(userId, dbClient);
  return getUsageSummaryForTier({ userId, tier, dbClient });
}

export async function ensureUsageMetricsExist(
  tx: Parameters<Parameters<DbClient['transaction']>[0]>[0],
  userId: string,
  month: string,
): Promise<void> {
  await tx
    .insert(usageMetrics)
    .values({
      userId,
      month,
      plansGenerated: 0,
      regenerationsUsed: 0,
      exportsUsed: 0,
    })
    .onConflictDoNothing({
      target: [usageMetrics.userId, usageMetrics.month],
    });
}

export async function incrementUsageInTx(
  tx: Parameters<Parameters<DbClient['transaction']>[0]>[0],
  userId: string,
  month: string,
  type: 'plan' | 'regeneration' | 'export',
): Promise<void> {
  await ensureUsageMetricsExist(tx, userId, month);

  const updateObj =
    type === 'plan'
      ? { plansGenerated: sql`${usageMetrics.plansGenerated} + 1` }
      : type === 'regeneration'
        ? { regenerationsUsed: sql`${usageMetrics.regenerationsUsed} + 1` }
        : { exportsUsed: sql`${usageMetrics.exportsUsed} + 1` };

  await tx
    .update(usageMetrics)
    .set({
      ...updateObj,
      updatedAt: new Date(),
    })
    .where(and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)));
}
