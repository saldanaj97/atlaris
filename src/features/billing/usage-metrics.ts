import { getDb } from '@/lib/db/runtime';
import { learningPlans, usageMetrics } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
import { and, eq, sql } from 'drizzle-orm';

import { UsageMetricsLoadError } from './errors';
import { getUserTier, type DbClient } from './tier';
import { TIER_LIMITS } from './tier-limits';
import type { SubscriptionTier } from './tier-limits.types';

// Usage type for incrementing counters
type UsageType = 'plan' | 'regeneration' | 'export';

type DecrementUsageColumn = 'pdfPlansGenerated' | 'regenerationsUsed';

type IncrementPdfPlanUsageOptions = {
  now?: () => Date;
};

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
 * Increment PDF plan usage counter for the current month
 */
export async function incrementPdfPlanUsage(
  userId: string,
  dbClient: DbClient = getDb(),
  opts?: IncrementPdfPlanUsageOptions
): Promise<void> {
  const month = getCurrentMonth(opts?.now?.());

  await getOrCreateUsageMetrics(userId, month, dbClient);

  await dbClient
    .update(usageMetrics)
    .set({
      pdfPlansGenerated: sql`${usageMetrics.pdfPlansGenerated} + 1`,
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
  const tier = await getUserTier(userId, dbClient);
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

async function decrementUsageColumn(
  userId: string,
  column: DecrementUsageColumn,
  actionLabel: string,
  successLogMessage: string,
  dbClient: DbClient = getDb()
): Promise<void> {
  const month = getCurrentMonth();

  if (column === 'pdfPlansGenerated') {
    const [updated] = await dbClient
      .update(usageMetrics)
      .set({
        pdfPlansGenerated: sql`GREATEST(0, ${usageMetrics.pdfPlansGenerated} - 1)`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month))
      )
      .returning({ pdfPlansGenerated: usageMetrics.pdfPlansGenerated });

    if (!updated) {
      logger.warn(
        { userId, month, action: actionLabel },
        'No usage metrics found to decrement'
      );
      return;
    }
    logger.info(
      {
        userId,
        month,
        action: actionLabel,
        newCount: updated.pdfPlansGenerated,
      },
      successLogMessage
    );
    return;
  }

  const [updated] = await dbClient
    .update(usageMetrics)
    .set({
      regenerationsUsed: sql`GREATEST(0, ${usageMetrics.regenerationsUsed} - 1)`,
      updatedAt: new Date(),
    })
    .where(and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)))
    .returning({ regenerationsUsed: usageMetrics.regenerationsUsed });

  if (!updated) {
    logger.warn(
      { userId, month, action: actionLabel },
      'No usage metrics found to decrement'
    );
    return;
  }
  logger.info(
    {
      userId,
      month,
      action: actionLabel,
      newCount: updated.regenerationsUsed,
    },
    successLogMessage
  );
}

/**
 * Decrement PDF plan usage counter (used when a PDF plan is deleted/rolled back).
 * This operation is performed outside a transaction and may fail silently if metrics don't exist.
 * The counter is clamped at 0 to prevent negative values.
 * Use this when undoing a PDF plan creation to maintain accurate quota accounting.
 *
 * @param userId - The user's UUID
 * @param dbClient - Database client (defaults to runtime DB with RLS)
 * @returns void (logs result but doesn't throw on missing metrics)
 */
export async function decrementPdfPlanUsage(
  userId: string,
  dbClient: DbClient = getDb()
): Promise<void> {
  await decrementUsageColumn(
    userId,
    'pdfPlansGenerated',
    'decrementPdfPlanUsage',
    'PDF plan usage decremented',
    dbClient
  );
}

/**
 * Decrement regeneration usage counter (used to roll back quota when an enqueue
 * request deduplicates against an already active regeneration job).
 * Counter is clamped at 0 to prevent negative values.
 */
export async function decrementRegenerationUsage(
  userId: string,
  dbClient: DbClient = getDb()
): Promise<void> {
  await decrementUsageColumn(
    userId,
    'regenerationsUsed',
    'decrementRegenerationUsage',
    'Regeneration usage decremented',
    dbClient
  );
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
      pdfPlansGenerated: 0,
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

export async function incrementPdfUsageInTx(
  tx: Parameters<Parameters<DbClient['transaction']>[0]>[0],
  userId: string,
  month: string
): Promise<void> {
  await tx
    .update(usageMetrics)
    .set({
      pdfPlansGenerated: sql`${usageMetrics.pdfPlansGenerated} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)));
}
