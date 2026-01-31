import { db } from '@/lib/db/service-role';
import { learningPlans, usageMetrics, users } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';

import { TIER_LIMITS, type SubscriptionTier } from './tier-limits';

export { TIER_LIMITS, type SubscriptionTier };

// Usage type for incrementing counters
export type UsageType = 'plan' | 'regeneration' | 'export';

export type PdfUsageMetrics = { pdfPlansGenerated: number };

/**
 * Get current month in YYYY-MM format
 */
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get or create usage metrics for current month
 */
async function getOrCreateUsageMetrics(userId: string, month: string) {
  const [created] = await db
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

  const [existing] = await db
    .select()
    .from(usageMetrics)
    .where(and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)))
    .limit(1);

  if (!existing) {
    throw new Error('Failed to load usage metrics');
  }

  return existing;
}

/**
 * Resolve user's subscription tier from database
 */
export async function resolveUserTier(
  userId: string
): Promise<SubscriptionTier> {
  const [user] = await db
    .select({ subscriptionTier: users.subscriptionTier })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new Error('User not found');
  }

  return user.subscriptionTier;
}

// Internal alias for backward compatibility
const getUserTier = resolveUserTier;

/**
 * Check if user can create more plans
 * @returns true if user can create more plans, false otherwise
 */
export async function checkPlanLimit(userId: string): Promise<boolean> {
  const tier = await getUserTier(userId);
  const limit = TIER_LIMITS[tier].maxActivePlans;

  if (limit === Infinity) {
    return true;
  }

  const currentCount = await countPlansContributingToCap(db, userId);
  return currentCount < limit;
}

/**
 * Check if user can use regenerations this month
 * @returns true if user has regenerations left, false otherwise
 * @deprecated Use atomicCheckAndIncrementUsage for concurrent-safe quota enforcement
 */
export async function checkRegenerationLimit(userId: string): Promise<boolean> {
  const tier = await getUserTier(userId);
  const limit = TIER_LIMITS[tier].monthlyRegenerations;

  if (limit === Infinity) {
    return true;
  }

  const month = getCurrentMonth();
  const metrics = await getOrCreateUsageMetrics(userId, month);

  return metrics.regenerationsUsed < limit;
}

/**
 * Check if user can export this month
 * @returns true if user has exports left, false otherwise
 * @deprecated Use atomicCheckAndIncrementUsage for concurrent-safe quota enforcement
 */
export async function checkExportLimit(userId: string): Promise<boolean> {
  const tier = await getUserTier(userId);
  const limit = TIER_LIMITS[tier].monthlyExports;

  if (limit === Infinity) {
    return true;
  }

  const month = getCurrentMonth();
  const metrics = await getOrCreateUsageMetrics(userId, month);

  return metrics.exportsUsed < limit;
}

type PdfQuotaDependencies = {
  resolveTier?: (userId: string) => Promise<SubscriptionTier>;
  getMetrics?: (userId: string, month: string) => Promise<PdfUsageMetrics>;
  now?: () => Date;
};

/**
 * Check if user can create more PDF-based plans this month
 * @returns true if user has PDF plan quota left, false otherwise
 */
export async function checkPdfPlanQuota(
  userId: string,
  deps: PdfQuotaDependencies = {}
): Promise<boolean> {
  const tier = await (deps.resolveTier ?? getUserTier)(userId);
  const limit = TIER_LIMITS[tier].monthlyPdfPlans;

  if (limit === Infinity) {
    return true;
  }

  const now = deps.now ? deps.now() : new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const metrics = await (deps.getMetrics ?? getOrCreateUsageMetrics)(
    userId,
    month
  );

  return metrics.pdfPlansGenerated < limit;
}

/**
 * Increment usage counter for the current month
 */
export async function incrementUsage(
  userId: string,
  type: UsageType
): Promise<void> {
  const month = getCurrentMonth();

  // Ensure metrics exist for this month
  await getOrCreateUsageMetrics(userId, month);

  // Increment the appropriate counter based on type
  const updateObj =
    type === 'plan'
      ? { plansGenerated: sql`${usageMetrics.plansGenerated} + 1` }
      : type === 'regeneration'
        ? { regenerationsUsed: sql`${usageMetrics.regenerationsUsed} + 1` }
        : { exportsUsed: sql`${usageMetrics.exportsUsed} + 1` };

  // Increment the counter
  await db
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
export async function incrementPdfPlanUsage(userId: string): Promise<void> {
  const month = getCurrentMonth();

  await getOrCreateUsageMetrics(userId, month);

  await db
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
export async function getUsageSummary(userId: string) {
  const tier = await getUserTier(userId);
  const limits = TIER_LIMITS[tier];
  const month = getCurrentMonth();
  const metrics = await getOrCreateUsageMetrics(userId, month);

  // Count active plans
  const [planCount] = await db
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
  dbOrTx: Pick<typeof db, 'select'>,
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
  }
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    // Lock the user row for update to prevent concurrent limit checks
    // This ensures that only one transaction at a time can check/insert plans for this user
    const [user] = await tx
      .select({ subscriptionTier: users.subscriptionTier })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');

    if (!user) {
      throw new Error('User not found');
    }

    const tier = user.subscriptionTier;
    const limit = TIER_LIMITS[tier].maxActivePlans;

    // If limit is Infinity (pro tier), skip the check
    if (limit !== Infinity) {
      // Count existing plans that count toward quota using shared helper
      const currentCount = await countPlansContributingToCap(tx, userId);

      if (currentCount >= limit) {
        throw new Error('Plan limit reached for current subscription tier.');
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
      throw new Error('Failed to create plan.');
    }

    return plan;
  });
}

export async function markPlanGenerationSuccess(
  planId: string,
  now: () => Date = () => new Date()
): Promise<void> {
  const timestamp = now();

  await db
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
  now: () => Date = () => new Date()
): Promise<void> {
  const timestamp = now();

  await db
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

export async function atomicCheckAndIncrementPdfUsage(
  userId: string
): Promise<AtomicPdfUsageResult> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ subscriptionTier: users.subscriptionTier })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');

    if (!user) {
      throw new Error('User not found');
    }

    const tier = user.subscriptionTier;
    const limit = TIER_LIMITS[tier].monthlyPdfPlans;

    if (limit === Infinity) {
      const month = getCurrentMonth();
      await ensureUsageMetricsExist(tx, userId, month);
      await incrementPdfUsageInTx(tx, userId, month);
      return { allowed: true, newCount: 1, limit: Infinity };
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
      throw new Error('Failed to lock usage metrics');
    }

    const currentCount = metrics.pdfPlansGenerated;

    if (currentCount >= limit) {
      return { allowed: false, currentCount, limit };
    }

    await incrementPdfUsageInTx(tx, userId, month);

    return { allowed: true, newCount: currentCount + 1, limit };
  });
}

export async function decrementPdfPlanUsage(userId: string): Promise<void> {
  const month = getCurrentMonth();

  await db
    .update(usageMetrics)
    .set({
      pdfPlansGenerated: sql`GREATEST(0, ${usageMetrics.pdfPlansGenerated} - 1)`,
    })
    .where(and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)));
}

export async function atomicCheckAndIncrementUsage(
  userId: string,
  type: AtomicUsageType
): Promise<AtomicUsageResult> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ subscriptionTier: users.subscriptionTier })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');

    if (!user) {
      throw new Error('User not found');
    }

    const tier = user.subscriptionTier;
    const limit =
      type === 'regeneration'
        ? TIER_LIMITS[tier].monthlyRegenerations
        : TIER_LIMITS[tier].monthlyExports;

    if (limit === Infinity) {
      const month = getCurrentMonth();
      await ensureUsageMetricsExist(tx, userId, month);
      await incrementUsageInTx(tx, userId, month, type);
      return { allowed: true, newCount: 1, limit: Infinity };
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
      throw new Error('Failed to lock usage metrics');
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
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
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

async function incrementUsageInTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
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
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
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
