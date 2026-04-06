import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import type { users } from '@/lib/db/schema';
import type { createLogger } from '@/lib/logging/logger';
import { syncSubscriptionToDb } from './subscriptions';

type Logger = ReturnType<typeof createLogger>;
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
  subscriptionPeriodEnd?: null;
  cancelAtPeriodEnd?: boolean;
  updatedAt: Date;
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

export async function applySubscriptionSync(
  subscription: Stripe.Subscription,
  deps: TransitionDeps,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<void> {
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

  const updatedUsers = await updateUsersByStripeCustomerId(
    customerId,
    {
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

  deps.logger.info('Stripe subscription deletion webhook processed');
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

  const updatedUsers = await updateUsersByStripeCustomerId(
    customerId,
    {
      subscriptionStatus: 'past_due',
      updatedAt: new Date(),
    },
    deps
  );

  if (updatedUsers.length === 0) {
    deps.logger.warn(
      {
        customerId,
        invoiceId: invoice.id,
      },
      'No user mapping found for invoice.payment_failed'
    );
    return;
  }

  deps.logger.info(
    { customerId },
    'Stripe invoice.payment_failed webhook processed'
  );
}
