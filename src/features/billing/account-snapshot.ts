import type { DbClient } from '@/lib/db/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  getUsageSummaryForTier,
  type UsageSummary,
} from '@/features/billing/usage-metrics';
import { getCorrelationId } from '@/lib/api/context';
import { AppError } from '@/lib/api/errors';
import { getDb } from '@supabase/runtime';
import { users } from '@supabase/schema';
import { eq } from 'drizzle-orm';

export class BillingSnapshotNotFoundError extends AppError {
  constructor(userId: string, correlationId?: string) {
    super('Billing account snapshot not found', {
      status: 404,
      code: 'BILLING_SNAPSHOT_NOT_FOUND',
      details: { userId },
      logMeta: correlationId ? { userId, correlationId } : { userId },
    });
  }
}

type BillingAccountSnapshot = {
  tier: SubscriptionTier;
  subscriptionStatus: 'active' | 'canceled' | 'past_due' | 'trialing' | null;
  subscriptionPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  usage: UsageSummary;
};

type SnapshotArgsBase = {
  userId: string;
  dbClient?: DbClient;
  correlationId?: string;
};

export async function getBillingAccountSnapshot(
  args: SnapshotArgsBase,
): Promise<BillingAccountSnapshot> {
  const {
    userId,
    dbClient = getDb(),
    correlationId = getCorrelationId(),
  } = args;

  const [billingRow] = await dbClient
    .select({
      tier: users.subscriptionTier,
      subscriptionStatus: users.subscriptionStatus,
      subscriptionPeriodEnd: users.subscriptionPeriodEnd,
      cancelAtPeriodEnd: users.cancelAtPeriodEnd,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!billingRow) {
    throw new BillingSnapshotNotFoundError(userId, correlationId);
  }

  const usage = await getUsageSummaryForTier({
    userId,
    tier: billingRow.tier,
    dbClient,
  });

  return {
    tier: billingRow.tier,
    subscriptionStatus: billingRow.subscriptionStatus,
    subscriptionPeriodEnd: billingRow.subscriptionPeriodEnd,
    cancelAtPeriodEnd: billingRow.cancelAtPeriodEnd,
    usage,
  };
}
