import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/runtime';
import { learningPlans, usageMetrics } from '@/lib/db/schema';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import { UsageMetricsLoadError } from './errors';
import { type DbClient, resolveUserTier } from './tier';
import { TIER_LIMITS } from './tier-limits';

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
  dbClient: DbClient = getDb()
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
  dbClient: DbClient = getDb()
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
 * Reset monthly usage counters (to be called by a cron job)
 * This is intentionally a no-op as we use monthly partitions
 * New months automatically start with zero counts via getOrCreateUsageMetrics
 */
/**
 * Get usage summary for a user
 */
export async function getUsageSummary(
  userId: string,
  dbClient: DbClient = getDb()
): Promise<UsageSummary> {
  const tier = await resolveUserTier(userId, dbClient);
  const limits = TIER_LIMITS[tier];
  const month = getCurrentMonth();
  const metrics = await getOrCreateUsageMetrics(userId, month, dbClient);

  // Count active plans
  const [planCount] = await dbClient
    .select({ count: sql`count(*)::int` })
    .from(learningPlans)
    .where(
      and(
        eq(learningPlans.userId, userId),
        eq(learningPlans.isQuotaEligible, true)
      )
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

export async function ensureUsageMetricsExist(
  tx: Parameters<Parameters<DbClient['transaction']>[0]>[0],
  userId: string,
  month: string
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
  type: 'regeneration' | 'export'
): Promise<void> {
  const updateObj =
    type === 'regeneration'
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
