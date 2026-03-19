import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/runtime';
import { usageMetrics, users } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';

import { UsageMetricsLockError, UserNotFoundError } from './errors';
import type { DbClient } from './tier';
import { TIER_LIMITS } from './tier-limits';
import {
  ensureUsageMetricsExist,
  getCurrentMonth,
  incrementPdfUsageInTx,
  incrementUsageInTx,
} from './usage-metrics';

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
