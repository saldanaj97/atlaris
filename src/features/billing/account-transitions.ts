import { eq, inArray } from 'drizzle-orm';
import type Stripe from 'stripe';
import { syncSubscriptionToDb } from '@/features/billing/subscriptions';
import type { users } from '@/lib/db/schema';
import type { Logger } from '@/lib/logging/logger';

type ServiceRoleDb = typeof import('@/lib/db/service-role').db;

export type TransitionDeps = {
  stripe?: Stripe;
  logger: Logger;
  db: ServiceRoleDb;
  users: typeof users;
};

type UpdateUsersByStripeCustomerIdSet = {
  subscriptionTier?: 'free';
  subscriptionStatus?: 'canceled' | 'past_due';
  stripeSubscriptionId?: null;
  subscriptionPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  updatedAt: Date;
};

type StripeMappedUser = {
  userId: string;
  subscriptionTier: 'free' | 'starter' | 'pro';
  subscriptionStatus: 'active' | 'canceled' | 'past_due' | 'trialing' | null;
  stripeSubscriptionId: string | null;
};

async function updateUsersByStripeCustomerId(
  customerId: string,
  set: UpdateUsersByStripeCustomerIdSet,
  deps: Pick<TransitionDeps, 'db' | 'users'>
) {
  return deps.db
    .update(deps.users)
    .set(set)
    .where(eq(deps.users.stripeCustomerId, customerId))
    .returning({ userId: deps.users.id });
}

async function getUsersByStripeCustomerId(
  customerId: string,
  deps: Pick<TransitionDeps, 'db' | 'users'>
): Promise<StripeMappedUser[]> {
  return deps.db
    .select({
      userId: deps.users.id,
      subscriptionTier: deps.users.subscriptionTier,
      subscriptionStatus: deps.users.subscriptionStatus,
      stripeSubscriptionId: deps.users.stripeSubscriptionId,
    })
    .from(deps.users)
    .where(eq(deps.users.stripeCustomerId, customerId));
}

async function updateUsersByIds(
  userIds: string[],
  set: UpdateUsersByStripeCustomerIdSet,
  deps: Pick<TransitionDeps, 'db' | 'users'>
) {
  if (userIds.length === 0) {
    return [];
  }

  return deps.db
    .update(deps.users)
    .set(set)
    .where(inArray(deps.users.id, userIds))
    .returning({ userId: deps.users.id });
}

export async function applySubscriptionSync(
  subscription: Stripe.Subscription,
  deps: TransitionDeps,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<void> {
  if (!deps.stripe) {
    throw new Error('Stripe client is required for subscription sync.');
  }

  await syncSubscriptionToDb(subscription, deps.stripe, options);
}

export async function applySubscriptionDeleted(
  subscription: Stripe.Subscription,
  deps: TransitionDeps
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  const currentPeriodEndTimestamp = (
    subscription as Stripe.Subscription & { current_period_end?: number }
  ).current_period_end;
  const currentPeriodEnd = currentPeriodEndTimestamp
    ? new Date(currentPeriodEndTimestamp * 1000)
    : null;
  const shouldRetainEntitlements =
    subscription.cancel_at_period_end === true &&
    currentPeriodEnd !== null &&
    currentPeriodEnd.getTime() > Date.now();

  const updatedUsers = await updateUsersByStripeCustomerId(
    customerId,
    shouldRetainEntitlements
      ? {
          subscriptionStatus: 'canceled',
          stripeSubscriptionId: null,
          subscriptionPeriodEnd: currentPeriodEnd,
          cancelAtPeriodEnd: true,
          updatedAt: new Date(),
        }
      : {
          subscriptionTier: 'free',
          subscriptionStatus: 'canceled',
          stripeSubscriptionId: null,
          subscriptionPeriodEnd: null,
          cancelAtPeriodEnd: false,
          updatedAt: new Date(),
        },
    deps
  );

  if (updatedUsers.length === 0) {
    deps.logger.warn(
      {
        customerId,
        stripeSubscriptionId: subscription.id,
      },
      'No user mapping found for customer.subscription.deleted'
    );
    return;
  }

  deps.logger.info(
    {
      customerId,
      userIds: updatedUsers.map(({ userId }) => userId),
      retainedEntitlementsUntil: shouldRetainEntitlements
        ? (currentPeriodEnd?.toISOString() ?? null)
        : null,
    },
    'Stripe subscription deletion webhook processed'
  );
}

export async function applyPaymentFailed(
  invoice: Stripe.Invoice,
  deps: TransitionDeps
): Promise<void> {
  const customerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id;

  if (!customerId) {
    deps.logger.warn(
      {
        invoiceId: invoice.id,
        invoiceCustomer: invoice.customer ?? null,
      },
      'No stripeCustomerId available for invoice.payment_failed'
    );
    return;
  }

  const mappedUsers = await getUsersByStripeCustomerId(customerId, deps);

  if (mappedUsers.length === 0) {
    deps.logger.warn(
      {
        customerId,
        invoiceId: invoice.id,
      },
      'No user mapping found for invoice.payment_failed'
    );
    return;
  }

  const eligibleUsers = mappedUsers.filter(
    (user) =>
      user.stripeSubscriptionId !== null &&
      (user.subscriptionStatus === 'trialing' ||
        user.subscriptionStatus === 'active' ||
        user.subscriptionStatus === 'past_due')
  );
  const skippedUsers = mappedUsers.filter(
    (user) => !eligibleUsers.some((eligible) => eligible.userId === user.userId)
  );

  if (skippedUsers.length > 0) {
    deps.logger.info(
      {
        customerId,
        invoiceId: invoice.id,
        skippedUsers: skippedUsers.map((user) => ({
          userId: user.userId,
          subscriptionTier: user.subscriptionTier,
          subscriptionStatus: user.subscriptionStatus,
        })),
      },
      'Skipped invoice.payment_failed transition for ineligible users'
    );
  }

  const updatedUsers = await updateUsersByIds(
    eligibleUsers.map((user) => user.userId),
    {
      subscriptionStatus: 'past_due',
      updatedAt: new Date(),
    },
    deps
  );

  if (updatedUsers.length === 0) {
    deps.logger.info(
      {
        customerId,
        invoiceId: invoice.id,
      },
      'No eligible users required invoice.payment_failed transition'
    );
    return;
  }

  deps.logger.info(
    { customerId },
    'Stripe invoice.payment_failed webhook processed'
  );
}
