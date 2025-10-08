import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { learningPlans, usageMetrics, users } from '@/lib/db/schema';

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
  const existing = await db
    .select()
    .from(usageMetrics)
    .where(and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const [created] = await db
    .insert(usageMetrics)
    .values({
      userId,
      month,
      plansGenerated: 0,
      regenerationsUsed: 0,
      exportsUsed: 0,
    })
    .returning();

  return created;
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

  // Determine which counter to increment
  const updateField =
    type === 'plan'
      ? usageMetrics.plansGenerated
      : type === 'regeneration'
        ? usageMetrics.regenerationsUsed
        : usageMetrics.exportsUsed;

  // Increment the counter
  await db
    .update(usageMetrics)
    .set({
      [updateField.name]: sql`${updateField} + 1`,
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
