import { eq } from 'drizzle-orm';
import { canOpenBillingPortalForUser } from '@/features/billing/stripe-commerce';
import {
  getUsageSummaryForTier,
  type UsageSummary,
} from '@/features/billing/usage-metrics';
import { getCorrelationId } from '@/lib/api/context';
import { AppError } from '@/lib/api/errors';
import type { DbUser } from '@/lib/db/queries/types/users.types';
import { getDb } from '@/lib/db/runtime';
import { users } from '@/lib/db/schema';
import type { DbClient } from '@/lib/db/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

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

export type BillingAccountProjection = 'full' | 'subscription';

export type BillingSubscriptionSnapshot = {
  tier: SubscriptionTier;
  subscriptionStatus: 'active' | 'canceled' | 'past_due' | 'trialing' | null;
  subscriptionPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  canOpenBillingPortal: boolean;
};

export type BillingAccountSnapshot = BillingSubscriptionSnapshot & {
  usage: UsageSummary;
};

type BillingRowSelect = {
  tier: SubscriptionTier;
  subscriptionStatus: BillingSubscriptionSnapshot['subscriptionStatus'];
  subscriptionPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

function toSubscriptionSnapshot(
  billingRow: BillingRowSelect,
): BillingSubscriptionSnapshot {
  return {
    tier: billingRow.tier,
    subscriptionStatus: billingRow.subscriptionStatus,
    subscriptionPeriodEnd: billingRow.subscriptionPeriodEnd,
    cancelAtPeriodEnd: billingRow.cancelAtPeriodEnd,
    stripeCustomerId: billingRow.stripeCustomerId,
    stripeSubscriptionId: billingRow.stripeSubscriptionId,
    canOpenBillingPortal: canOpenBillingPortalForUser(billingRow),
  };
}

/**
 * Subset of the `users` row required to derive a `BillingSubscriptionSnapshot`.
 * Kept in sync with `BillingRowSelect` so callers holding a full `DbUser`
 * (e.g. server components with an authed user) can avoid a second SELECT.
 */
type BillingSubscriptionInput = Pick<
  DbUser,
  | 'subscriptionTier'
  | 'subscriptionStatus'
  | 'subscriptionPeriodEnd'
  | 'cancelAtPeriodEnd'
  | 'stripeCustomerId'
  | 'stripeSubscriptionId'
>;

/**
 * Synchronous projection: derive a `BillingSubscriptionSnapshot` from an
 * in-memory `users` row. Use this when an authed user object is already loaded
 * (e.g. `withServerComponentContext`) to avoid re-reading the row via
 * `getBillingAccountSnapshot({ projection: 'subscription' })`.
 */
export function deriveBillingSubscriptionSnapshot(
  user: BillingSubscriptionInput,
): BillingSubscriptionSnapshot {
  return toSubscriptionSnapshot({
    tier: user.subscriptionTier,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionPeriodEnd: user.subscriptionPeriodEnd,
    cancelAtPeriodEnd: user.cancelAtPeriodEnd,
    stripeCustomerId: user.stripeCustomerId,
    stripeSubscriptionId: user.stripeSubscriptionId,
  });
}

type SnapshotArgsBase = {
  userId: string;
  dbClient?: DbClient;
  correlationId?: string;
};

export async function getBillingAccountSnapshot(
  args: SnapshotArgsBase & { projection?: 'full' },
): Promise<BillingAccountSnapshot>;
export async function getBillingAccountSnapshot(
  args: SnapshotArgsBase & { projection: 'subscription' },
): Promise<BillingSubscriptionSnapshot>;
export async function getBillingAccountSnapshot(
  args: SnapshotArgsBase & { projection?: BillingAccountProjection },
): Promise<BillingAccountSnapshot | BillingSubscriptionSnapshot> {
  const {
    userId,
    dbClient = getDb(),
    correlationId = getCorrelationId(),
    projection = 'full',
  } = args;

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
    throw new BillingSnapshotNotFoundError(userId, correlationId);
  }

  const subscription = toSubscriptionSnapshot(billingRow);

  if (projection === 'subscription') {
    return subscription;
  }

  const usage = await getUsageSummaryForTier({
    userId,
    tier: billingRow.tier,
    dbClient,
  });

  return {
    ...subscription,
    usage,
  };
}
