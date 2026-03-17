import { getDb } from '@/lib/db/runtime';
import { learningPlans, usageMetrics, users } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
import { and, eq, sql } from 'drizzle-orm';

import {
  UsageMetricsLoadError,
  UsageMetricsLockError,
  UserNotFoundError,
} from './errors';
import { TIER_LIMITS } from './tier-limits';
import type { SubscriptionTier } from './tier-limits.types';

// Type for DB client (compatible with both runtime and service-role clients)
type DbClient = ReturnType<typeof getDb>;

export { TIER_LIMITS };
export type { SubscriptionTier } from './tier-limits.types';

// Usage type for incrementing counters
type UsageType = 'plan' | 'regeneration' | 'export';

type PdfUsageMetrics = { pdfPlansGenerated: number };

/**
 * Get current month in YYYY-MM format
 */
function getCurrentMonth(now?: Date): string {
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
 * Resolve user's subscription tier from database
 */
export async function resolveUserTier(
  userId: string,
  dbClient: DbClient = getDb()
): Promise<SubscriptionTier> {
  const [user] = await dbClient
    .select({ subscriptionTier: users.subscriptionTier })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new UserNotFoundError(userId);
  }

  return user.subscriptionTier;
}

// Internal alias for backward compatibility
const getUserTier = resolveUserTier;

/**
 * Check if user can use regenerations this month
 * @returns true if user has regenerations left, false otherwise
 * @deprecated Use atomicCheckAndIncrementUsage for concurrent-safe quota enforcement
 */
export async function checkRegenerationLimit(
  userId: string,
  dbClient: DbClient = getDb()
): Promise<boolean> {
  const tier = await getUserTier(userId, dbClient);
  const limit = TIER_LIMITS[tier].monthlyRegenerations;

  if (limit === Infinity) {
    return true;
  }

  const month = getCurrentMonth();
  const metrics = await getOrCreateUsageMetrics(userId, month, dbClient);

  return metrics.regenerationsUsed < limit;
}

/**
 * Check if user can export this month
 * @returns true if user has exports left, false otherwise
 * @deprecated Use atomicCheckAndIncrementUsage for concurrent-safe quota enforcement
 */
export async function checkExportLimit(
  userId: string,
  dbClient: DbClient = getDb()
): Promise<boolean> {
  const tier = await getUserTier(userId, dbClient);
  const limit = TIER_LIMITS[tier].monthlyExports;

  if (limit === Infinity) {
    return true;
  }

  const month = getCurrentMonth();
  const metrics = await getOrCreateUsageMetrics(userId, month, dbClient);

  return metrics.exportsUsed < limit;
}

type PdfQuotaDependencies = {
  resolveTier?: (
    userId: string,
    dbClient?: DbClient
  ) => Promise<SubscriptionTier>;
  getMetrics?: (
    userId: string,
    month: string,
    dbClient?: DbClient
  ) => Promise<PdfUsageMetrics>;
  now?: () => Date;
  dbClient?: DbClient;
};

/**
 * Check if user can create more PDF-based plans this month
 * @returns true if user has PDF plan quota left, false otherwise
 * @deprecated Use atomicCheckAndIncrementPdfUsage for concurrent-safe quota enforcement
 */
export async function checkPdfPlanQuota(
  userId: string,
  deps: PdfQuotaDependencies = {}
): Promise<boolean> {
  const dbClient = deps.dbClient ?? getDb();
  const tier = await (deps.resolveTier ?? getUserTier)(userId, dbClient);
  const limit = TIER_LIMITS[tier].monthlyPdfPlans;

  if (limit === Infinity) {
    return true;
  }

  const month = getCurrentMonth(deps.now?.());
  const metrics = await (deps.getMetrics ?? getOrCreateUsageMetrics)(
    userId,
    month,
    dbClient
  );

  return metrics.pdfPlansGenerated < limit;
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

type IncrementPdfPlanUsageOptions = {
  now?: () => Date;
};

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
) {
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

type AtomicUsageType = 'regeneration' | 'export';

type AtomicUsageResult =
  | { allowed: true; newCount: number; limit: number }
  | { allowed: false; currentCount: number; limit: number };

type AtomicPdfUsageResult =
  | { allowed: true; newCount: number; limit: number }
  | { allowed: false; currentCount: number; limit: number };

/**
 * Atomically check PDF plan quota and increment usage counter in a single transaction.
 * This uses database-level locking to ensure concurrent requests cannot exceed the user's PDF plan limit.
 * For users on Infinity-tier subscription, the quota is bypassed and the counter is incremented unconditionally.
 *
 * @param userId - The user's UUID
 * @param dbClient - Database client (defaults to runtime DB with RLS)
 * @returns AtomicPdfUsageResult with allowed status, current/new count, and limit
 * @throws Error if user not found or failed to lock usage metrics
 */
export async function atomicCheckAndIncrementPdfUsage(
  userId: string,
  dbClient: DbClient = getDb()
): Promise<AtomicPdfUsageResult> {
  return dbClient.transaction(async (tx) => {
    const [user] = await tx
      .select({ subscriptionTier: users.subscriptionTier })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');

    if (!user) {
      throw new UserNotFoundError(userId);
    }

    const tier = user.subscriptionTier;
    const limit = TIER_LIMITS[tier].monthlyPdfPlans;

    if (limit === Infinity) {
      const month = getCurrentMonth();
      await ensureUsageMetricsExist(tx, userId, month);

      const [metrics] = await tx
        .select()
        .from(usageMetrics)
        .where(
          and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month))
        )
        .for('update');

      if (!metrics) {
        throw new UsageMetricsLockError(userId, month);
      }

      const currentCount = metrics.pdfPlansGenerated;
      const newCount = currentCount + 1;

      await incrementPdfUsageInTx(tx, userId, month);
      logger.info(
        {
          userId,
          month,
          action: 'atomicCheckAndIncrementPdfUsage',
          newCount,
          limit: Infinity,
        },
        'PDF plan quota allowed (Infinity tier)'
      );
      return { allowed: true, newCount, limit: Infinity };
    }

    const month = getCurrentMonth();
    await ensureUsageMetricsExist(tx, userId, month);

    const [metrics] = await tx
      .select()
      .from(usageMetrics)
      .where(
        and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month))
      )
      .for('update');

    if (!metrics) {
      throw new UsageMetricsLockError(userId, month);
    }

    const currentCount = metrics.pdfPlansGenerated;

    if (currentCount >= limit) {
      logger.warn(
        {
          userId,
          month,
          action: 'atomicCheckAndIncrementPdfUsage',
          currentCount,
          limit,
        },
        'PDF plan quota denied'
      );
      return { allowed: false, currentCount, limit };
    }

    await incrementPdfUsageInTx(tx, userId, month);

    logger.info(
      {
        userId,
        month,
        action: 'atomicCheckAndIncrementPdfUsage',
        newCount: currentCount + 1,
        limit,
      },
      'PDF plan quota allowed'
    );
    return { allowed: true, newCount: currentCount + 1, limit };
  });
}

type DecrementUsageColumn = 'pdfPlansGenerated' | 'regenerationsUsed';

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

export async function atomicCheckAndIncrementUsage(
  userId: string,
  type: AtomicUsageType,
  dbClient: DbClient = getDb()
): Promise<AtomicUsageResult> {
  return dbClient.transaction(async (tx) => {
    const [user] = await tx
      .select({ subscriptionTier: users.subscriptionTier })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');

    if (!user) {
      throw new UserNotFoundError(userId);
    }

    const tier = user.subscriptionTier;
    const limit =
      type === 'regeneration'
        ? TIER_LIMITS[tier].monthlyRegenerations
        : TIER_LIMITS[tier].monthlyExports;

    if (limit === Infinity) {
      const month = getCurrentMonth();
      await ensureUsageMetricsExist(tx, userId, month);

      const [metrics] = await tx
        .select()
        .from(usageMetrics)
        .where(
          and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month))
        )
        .for('update');

      if (!metrics) {
        throw new UsageMetricsLockError(userId, month);
      }

      const currentCount =
        type === 'regeneration'
          ? metrics.regenerationsUsed
          : metrics.exportsUsed;
      const newCount = currentCount + 1;

      await incrementUsageInTx(tx, userId, month, type);
      return { allowed: true, newCount, limit: Infinity };
    }

    const month = getCurrentMonth();
    await ensureUsageMetricsExist(tx, userId, month);

    const [metrics] = await tx
      .select()
      .from(usageMetrics)
      .where(
        and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month))
      )
      .for('update');

    if (!metrics) {
      throw new UsageMetricsLockError(userId, month);
    }

    const currentCount =
      type === 'regeneration' ? metrics.regenerationsUsed : metrics.exportsUsed;

    if (currentCount >= limit) {
      return { allowed: false, currentCount, limit };
    }

    await incrementUsageInTx(tx, userId, month, type);

    return { allowed: true, newCount: currentCount + 1, limit };
  });
}

async function ensureUsageMetricsExist(
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

async function incrementUsageInTx(
  tx: Parameters<Parameters<DbClient['transaction']>[0]>[0],
  userId: string,
  month: string,
  type: AtomicUsageType
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

async function incrementPdfUsageInTx(
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

export const __test__ = { TIER_LIMITS };
