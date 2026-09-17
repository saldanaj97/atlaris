/**
 * Private regeneration quota reservation core.
 *
 * Public callers should not import this module directly. Use
 * `regeneration-quota-boundary.ts`; do not import this file from routes.
 */

import type { DbClient } from './tier';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { UsageMetricsLockError, UserNotFoundError } from './errors';
import {
  ensureUsageMetricsExist,
  getCurrentMonth,
  incrementExistingUsageInTx,
} from './usage-metrics';
import { TIER_LIMITS } from '@/shared/constants/tier-limits';
import { usageMetrics, users } from '@supabase/schema';
import { and, eq } from 'drizzle-orm';

/**
 * Drizzle's `db.transaction` callback receives a transaction-scoped client.
 * `BillingTx` extracts that callback parameter type so helpers like
 * `selectUserSubscriptionTierForUpdate` and `lockUsageMetricsForMonth` can
 * accept it without leaking Drizzle internals into every signature.
 */
export type BillingTx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

export type ReserveMeteredResult =
  | { ok: true }
  | { ok: false; currentCount: number; limit: number };

export async function selectUserSubscriptionTierForUpdate(
  tx: BillingTx,
  userId: string,
): Promise<{ subscriptionTier: SubscriptionTier }> {
  const [user] = await tx
    .select({ subscriptionTier: users.subscriptionTier })
    .from(users)
    .where(eq(users.id, userId))
    .for('update');

  if (!user) {
    throw new UserNotFoundError(userId);
  }
  return user;
}

async function lockUsageMetricsForMonth(
  tx: BillingTx,
  userId: string,
  month: string,
) {
  await ensureUsageMetricsExist(tx, userId, month);
  const [metrics] = await tx
    .select()
    .from(usageMetrics)
    .where(and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)))
    .for('update');

  if (!metrics) {
    throw new UsageMetricsLockError(userId, month);
  }
  return metrics;
}

type ReserveMeteredUsageOptions = {
  /** Override the current-month resolver (testing or cross-midnight scenarios). */
  now?: () => Date;
};

export async function reserveMeteredUsageInTx(
  tx: BillingTx,
  userId: string,
  options: ReserveMeteredUsageOptions = {},
): Promise<ReserveMeteredResult> {
  const user = await selectUserSubscriptionTierForUpdate(tx, userId);
  const limit = TIER_LIMITS[user.subscriptionTier].monthlyRegenerations;
  const month = getCurrentMonth(options.now?.());

  const metrics = await lockUsageMetricsForMonth(tx, userId, month);
  const currentCount = metrics.regenerationsUsed;

  if (limit !== Infinity && currentCount >= limit) {
    return { ok: false, currentCount, limit };
  }

  await incrementExistingUsageInTx(tx, userId, month, 'regeneration');

  return { ok: true };
}
