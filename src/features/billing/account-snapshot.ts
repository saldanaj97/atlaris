import { eq } from 'drizzle-orm';
import { canOpenBillingPortalForUser } from '@/features/billing/portal-eligibility';
import type { SubscriptionTier } from '@/features/billing/tier-limits.types';
import {
  getUsageSummary,
  type UsageSummary,
} from '@/features/billing/usage-metrics';
import { getCorrelationId } from '@/lib/api/context';
import { getDb } from '@/lib/db/runtime';
import { users } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';

type DbClient = ReturnType<typeof getDb>;

export class BillingSnapshotNotFoundError extends Error {
  constructor(userId: string, correlationId?: string) {
    super(
      correlationId
        ? `Billing account snapshot not found for user ${userId} (correlationId=${correlationId})`
        : `Billing account snapshot not found for user ${userId}`
    );
    this.name = 'BillingSnapshotNotFoundError';
  }
}

export interface BillingAccountSnapshot {
  tier: SubscriptionTier;
  subscriptionStatus: 'active' | 'canceled' | 'past_due' | 'trialing' | null;
  subscriptionPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  canOpenBillingPortal: boolean;
  usage: UsageSummary;
}

/**
 * Canonical billing-account read for authenticated surfaces that need both
 * subscription state and usage state in one contract.
 */
export async function getBillingAccountSnapshot(
  userId: string,
  dbClient: DbClient = getDb(),
  correlationId = getCorrelationId()
): Promise<BillingAccountSnapshot> {
  const [billingRow] = await dbClient
    .select({
      tier: users.subscriptionTier,
      subscriptionStatus: users.subscriptionStatus,
      subscriptionPeriodEnd: users.subscriptionPeriodEnd,
      cancelAtPeriodEnd: users.cancelAtPeriodEnd,
      stripeCustomerId: users.stripeCustomerId,
      stripeSubscriptionId: users.stripeSubscriptionId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!billingRow) {
    logger.error(
      {
        userId,
        correlationId,
        query: 'getBillingAccountSnapshot.users.selectById',
      },
      'Billing snapshot lookup failed because user was not found'
    );
    throw new BillingSnapshotNotFoundError(userId, correlationId);
  }

  const usage = await getUsageSummary(userId, dbClient);

  return {
    tier: billingRow.tier,
    subscriptionStatus: billingRow.subscriptionStatus,
    subscriptionPeriodEnd: billingRow.subscriptionPeriodEnd,
    cancelAtPeriodEnd: billingRow.cancelAtPeriodEnd,
    stripeCustomerId: billingRow.stripeCustomerId,
    stripeSubscriptionId: billingRow.stripeSubscriptionId,
    canOpenBillingPortal: canOpenBillingPortalForUser(billingRow),
    usage,
  };
}
