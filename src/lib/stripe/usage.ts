import { db } from '@/lib/db/drizzle';
import { learningPlans, usageMetrics, users } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';

/**
 * Subscription tier limits
 */
const TIER_LIMITS = {
  free: {
    maxActivePlans: 3,
    monthlyRegenerations: 5,
    monthlyExports: 10,
  },
  starter: {
    maxActivePlans: 10,
    monthlyRegenerations: 10,
    monthlyExports: 50,
  },
  pro: {
    maxActivePlans: Infinity,
    monthlyRegenerations: 50,
    monthlyExports: Infinity,
  },
} as const;

type SubscriptionTier = keyof typeof TIER_LIMITS;

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
 * Get user's subscription tier
 */
async function getUserTier(userId: string): Promise<SubscriptionTier> {
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

  // Count active plans (non-deleted plans)
  const [result] = await db
    .select({ count: sql`count(*)::int` })
    .from(learningPlans)
    .where(eq(learningPlans.userId, userId));

  const currentCount = (result?.count as number) ?? 0;
  return currentCount < limit;
}

/**
 * Check if user can use regenerations this month
 * @returns true if user has regenerations left, false otherwise
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

/**
 * Usage type for incrementing counters
 */
export type UsageType = 'plan' | 'regeneration' | 'export';

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
    .where(eq(learningPlans.userId, userId));

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
    origin: 'ai' | 'manual';
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
      // Count existing plans (the user row is already locked, preventing races)
      const [result] = await tx
        .select({ count: sql`count(*)::int` })
        .from(learningPlans)
        .where(eq(learningPlans.userId, userId));

      const currentCount = (result?.count as number) ?? 0;

      if (currentCount >= limit) {
        throw new Error('Plan limit reached for current subscription tier.');
      }
    }

    // Insert the plan within the same transaction (atomic with the check)
    const [plan] = await tx
      .insert(learningPlans)
      .values({
        userId,
        ...planData,
      })
      .returning({ id: learningPlans.id });

    if (!plan) {
      throw new Error('Failed to create plan.');
    }

    return plan;
  });
}
