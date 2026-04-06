import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/runtime';
import { users } from '@/lib/db/schema';
import { canOpenBillingPortalForUser } from './portal-eligibility';
import type { SubscriptionTier } from './tier-limits.types';
import { getUsageSummary, type UsageSummary } from './usage-metrics';

type DbClient = ReturnType<typeof getDb>;

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
  dbClient: DbClient = getDb()
): Promise<BillingAccountSnapshot> {
  const [billingRow, usage] = await Promise.all([
    dbClient
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
      .limit(1)
      .then((rows) => rows[0]),
    getUsageSummary(userId, dbClient),
  ]);

  if (!billingRow) {
    throw new Error('User not found');
  }

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
