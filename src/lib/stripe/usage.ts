import { getDb } from '@/lib/db/runtime';
import { learningPlans, usageMetrics, users } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
import { and, eq, sql } from 'drizzle-orm';

import {
  PlanCreationError,
  PlanLimitReachedError,
  UsageMetricsLoadError,
  UsageMetricsLockError,
  UserNotFoundError,
} from './errors';
import { TIER_LIMITS, type SubscriptionTier } from './tier-limits';

// Type for DB client (compatible with both runtime and service-role clients)
type DbClient = ReturnType<typeof getDb>;

export { TIER_LIMITS, type SubscriptionTier };

// Usage type for incrementing counters
export type UsageType = 'plan' | 'regeneration' | 'export';

export type PdfUsageMetrics = { pdfPlansGenerated: number };

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
 * Check if user can create more plans
 * @returns true if user can create more plans, false otherwise
 */
export async function checkPlanLimit(
  userId: string,
  dbClient: DbClient = getDb()
): Promise<boolean> {
  const tier = await getUserTier(userId, dbClient);
  const limit = TIER_LIMITS[tier].maxActivePlans;

  if (limit === Infinity) {
    return true;
  }

  const currentCount = await countPlansContributingToCap(dbClient, userId);
  return currentCount < limit;
}

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

/**
 * Increment PDF plan usage counter for the current month
 */
export async function incrementPdfPlanUsage(
  userId: string,
  dbClient: DbClient = getDb()
): Promise<void> {
  const month = getCurrentMonth();

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
export function resetMonthlyUsage(): void {
  // No-op: usage is reset automatically by month partitioning
  // Each month gets its own row, so old months remain for history
  // New months start at 0 automatically via getOrCreateUsageMetrics
}

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
  // Use a single query with filtered aggregates to count both buckets
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

  // Return the summed count
  return (result?.count as number) ?? 0;
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
    visibility: 'private' | 'public';
    origin: 'ai' | 'manual' | 'template' | 'pdf';
    startDate?: string | null;
    deadlineDate?: string | null;
  },
  dbClient: DbClient = getDb()
): Promise<{ id: string }> {
  return dbClient.transaction(async (tx) => {
    // Lock the user row for update to prevent concurrent limit checks
    // This ensures that only one transaction at a time can check/insert plans for this user
    const [user] = await tx
      .select({ subscriptionTier: users.subscriptionTier })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');

    if (!user) {
      throw new UserNotFoundError(userId);
    }

    const tier = user.subscriptionTier;
    const limit = TIER_LIMITS[tier].maxActivePlans;

    // If limit is Infinity (pro tier), skip the check
    if (limit !== Infinity) {
      // Count existing plans that count toward quota using shared helper
      const currentCount = await countPlansContributingToCap(tx, userId);

      if (currentCount >= limit) {
        throw new PlanLimitReachedError(currentCount, limit);
      }
    }

    // Insert the plan within the same transaction (atomic with the checks)
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
  dbClient: DbClient = getDb(),
  now: () => Date = () => new Date()
): Promise<void> {
  const timestamp = now();

  await dbClient
    .update(learningPlans)
    .set({
      generationStatus: 'ready',
      isQuotaEligible: true,
      finalizedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(eq(learningPlans.id, planId));
}

export async function markPlanGenerationFailure(
  planId: string,
  dbClient: DbClient = getDb(),
  now: () => Date = () => new Date()
): Promise<void> {
  const timestamp = now();

  await dbClient
    .update(learningPlans)
    .set({
      generationStatus: 'failed',
      isQuotaEligible: false,
      updatedAt: timestamp,
    })
    .where(eq(learningPlans.id, planId));
}

export type AtomicUsageType = 'regeneration' | 'export';

export type AtomicUsageResult =
  | { allowed: true; newCount: number; limit: number }
  | { allowed: false; currentCount: number; limit: number };

export type AtomicPdfUsageResult =
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
  const month = getCurrentMonth();

  const [before] = await dbClient
    .select({ pdfPlansGenerated: usageMetrics.pdfPlansGenerated })
    .from(usageMetrics)
    .where(and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)))
    .limit(1);

  if (!before) {
    logger.warn(
      { userId, month, action: 'decrementPdfPlanUsage' },
      'No usage metrics found to decrement'
    );
    return;
  }

  await dbClient
    .update(usageMetrics)
    .set({
      pdfPlansGenerated: sql`GREATEST(0, ${usageMetrics.pdfPlansGenerated} - 1)`,
    })
    .where(and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)));

  logger.info(
    {
      userId,
      month,
      action: 'decrementPdfPlanUsage',
      priorCount: before.pdfPlansGenerated,
    },
    'PDF plan usage decremented'
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

const TIER_RECOMMENDATION_THRESHOLD_WEEKS = 8;

export function checkPlanDurationCap(params: {
  tier: SubscriptionTier;
  weeklyHours: number;
  totalWeeks: number;
}): { allowed: boolean; reason?: string; upgradeUrl?: string } {
  const caps = TIER_LIMITS[params.tier];
  if (caps.maxWeeks !== null && params.totalWeeks > caps.maxWeeks) {
    const recommended =
      params.totalWeeks > TIER_RECOMMENDATION_THRESHOLD_WEEKS
        ? 'pro'
        : 'starter';
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
      reason: `${String(params.tier)} tier limited to ${String(caps.maxHours)} total hours. Upgrade for more time.`,
      upgradeUrl: '/pricing',
    };
  }
  return { allowed: true };
}

export const __test__ = { TIER_LIMITS };
