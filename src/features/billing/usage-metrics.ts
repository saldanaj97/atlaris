import type { DbClient } from '@/lib/db/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { UsageMetricsLoadError } from './errors';
import { resolveUserTier } from './tier';
import { ValidationError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';
import { TIER_LIMITS } from '@/shared/constants/tier-limits';
import { learningPlans, usageMetrics } from '@supabase/schema';
import { and, eq, sql } from 'drizzle-orm';

// Usage type for incrementing counters
export type UsageType = 'plan' | 'regeneration';

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
};

function getUsageCounterUpdate(type: UsageType) {
  switch (type) {
    case 'plan':
      return { plansGenerated: sql`${usageMetrics.plansGenerated} + 1` };
    case 'regeneration':
      return {
        regenerationsUsed: sql`${usageMetrics.regenerationsUsed} + 1`,
      };
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/**
 * Get current month in YYYY-MM format
 */
export function getCurrentMonth(now?: Date): string {
  const d = now ?? new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function selectUsageMetricsForMonth(
  userId: string,
  month: string,
  dbClient: DbClient,
) {
  const [metrics] = await dbClient
    .select()
    .from(usageMetrics)
    .where(and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)))
    .limit(1);

  return metrics ?? null;
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
  dbClient: DbClient;
}): Promise<UsageSummary> {
  const { userId, tier, dbClient } = args;
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
  const [metrics, [planCount]] = await Promise.all([
    selectUsageMetricsForMonth(userId, month, dbClient),
    dbClient
      .select({ count: sql`count(*)::int` })
      .from(learningPlans)
      .where(
        and(
          eq(learningPlans.userId, userId),
          eq(learningPlans.isQuotaEligible, true),
        ),
      ),
  ]);

  return {
    tier,
    activePlans: {
      current: (planCount?.count as number) ?? 0,
      limit: limits.maxActivePlans,
    },
    regenerations: {
      used: metrics?.regenerationsUsed ?? 0,
      limit: limits.monthlyRegenerations,
    },
  };
}

/**
 * Get usage summary for a user; auto-resolves tier from the `users` row.
 */
export async function getUsageSummary(
  userId: string,
  dbClient: DbClient,
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
      lessonModulesGenerated: 0,
    })
    .onConflictDoNothing({
      target: [usageMetrics.userId, usageMetrics.month],
    });
}

export async function incrementUsageInTx(
  tx: Parameters<Parameters<DbClient['transaction']>[0]>[0],
  userId: string,
  month: string,
  type: UsageType,
): Promise<void> {
  await ensureUsageMetricsExist(tx, userId, month);
  await incrementExistingUsageInTx(tx, userId, month, type);
}

export async function incrementExistingUsageInTx(
  tx: Parameters<Parameters<DbClient['transaction']>[0]>[0],
  userId: string,
  month: string,
  type: UsageType,
): Promise<void> {
  const updateObj = getUsageCounterUpdate(type);

  const updated = await tx
    .update(usageMetrics)
    .set({
      ...updateObj,
      updatedAt: new Date(),
    })
    .where(and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)))
    .returning({ id: usageMetrics.id });

  if (updated.length === 0) {
    throw new UsageMetricsLoadError(userId, month);
  }
}

/**
 * Records a provider-started module lesson attempt for operational telemetry.
 * This counter is observational only and is not a product entitlement.
 */
export async function incrementLessonModulesGeneratedInTx(
  tx: Parameters<Parameters<DbClient['transaction']>[0]>[0],
  userId: string,
  month: string,
): Promise<void> {
  await ensureUsageMetricsExist(tx, userId, month);

  const updated = await tx
    .update(usageMetrics)
    .set({
      lessonModulesGenerated: sql`${usageMetrics.lessonModulesGenerated} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)))
    .returning({ id: usageMetrics.id });

  if (updated.length === 0) {
    throw new UsageMetricsLoadError(userId, month);
  }
}
