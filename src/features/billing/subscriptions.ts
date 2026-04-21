import { eq, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { mapStripeSubscriptionStatus } from '@/features/billing/stripe-commerce/subscription-status';
import { getDb } from '@/lib/db/runtime';
import { users } from '@/lib/db/schema';
import type { DbClient } from '@/lib/db/types';
import { logger } from '@/lib/logging/logger';
import { getStripe } from './client';

const CUSTOMER_PROVISION_LOCK_KEY = 2;
const CUSTOMER_PROVISION_REQUEST_TIMEOUT_MS = 10_000;
const CUSTOMER_PROVISION_WARN_THRESHOLD_MS = 500;

type SyncSubscriptionToDbDeps = {
  dbClient: DbClient;
  stripe?: Stripe;
  signal?: AbortSignal;
  timeoutMs?: number;
};

function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function withAbortSignal<T>(
  promise: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (!signal) {
    return promise;
  }

  if (signal.aborted) {
    throw createAbortError('Stripe request aborted before execution.');
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(createAbortError('Stripe request aborted.'));
    };

    signal.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        const normalizedError =
          error instanceof Error
            ? error
            : new Error(`Unknown rejection reason: ${String(error)}`);
        reject(normalizedError);
      }
    );
  });
}

/**
 * Get user's subscription tier from database
 */
export async function getSubscriptionTier(
  userId: string,
  dbClient: DbClient = getDb()
) {
  const [user] = await dbClient
    .select({
      subscriptionTier: users.subscriptionTier,
      subscriptionStatus: users.subscriptionStatus,
      subscriptionPeriodEnd: users.subscriptionPeriodEnd,
      stripeCustomerId: users.stripeCustomerId,
      stripeSubscriptionId: users.stripeSubscriptionId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new Error('User not found');
  }

  return user;
}

/**
 * Sync subscription data from Stripe to database
 * Called from webhook handlers
 * @param deps.dbClient Database client used for reads/writes (typically service-role in webhooks)
 * @param deps.stripe Optional Stripe client (for tests); uses getStripe() when omitted
 */
export async function syncSubscriptionToDb(
  subscription: Stripe.Subscription,
  deps: SyncSubscriptionToDbDeps
): Promise<void> {
  const stripe = deps.stripe ?? getStripe();
  const { dbClient } = deps;
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  // Find user by Stripe customer ID
  const [user] = await dbClient
    .select({
      id: users.id,
      subscriptionTier: users.subscriptionTier,
    })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);

  if (!user) {
    logger.error(
      {
        customerId,
        event: 'subscription_sync_missing_user',
      },
      'No user found for Stripe customer ID. Skipping sync.'
    );
    return;
  }

  // Determine subscription tier from price metadata
  const priceId =
    typeof subscription.items.data[0]?.price === 'string'
      ? subscription.items.data[0].price
      : subscription.items.data[0]?.price.id;

  const existingTier =
    user.subscriptionTier === 'starter' || user.subscriptionTier === 'pro'
      ? user.subscriptionTier
      : 'free';

  let tier: 'free' | 'starter' | 'pro' = existingTier;

  if (priceId) {
    const requestTimeoutMs = deps.timeoutMs ?? 10_000;
    try {
      const price = await withAbortSignal(
        stripe.prices.retrieve(
          priceId,
          {
            expand: ['product'],
          },
          {
            timeout: requestTimeoutMs,
          }
        ),
        deps.signal
      );

      const product = price.product as Stripe.Product;
      const tierMetadata = product.metadata?.tier;

      if (tierMetadata === 'starter' || tierMetadata === 'pro') {
        tier = tierMetadata;
      }
    } catch (error) {
      if (isAbortError(error)) {
        logger.warn(
          {
            priceId,
            event: 'subscription_sync_price_fetch_aborted',
            timeoutMs: requestTimeoutMs,
          },
          'Stripe price lookup aborted during subscription sync'
        );
      } else {
        logger.error(
          {
            priceId,
            event: 'subscription_sync_price_fetch_failed',
            error,
          },
          'Error retrieving Stripe price/product during subscription sync'
        );
      }

      throw new Error(
        `Unable to determine subscription tier for Stripe price ${priceId}`
      );
    }
  }

  const status = mapStripeSubscriptionStatus(subscription.status);

  // current_period_end is present on the wire but missing from Stripe.Subscription
  // typings on this SDK pin; intersect rather than double-cast.
  const periodEnd = (
    subscription as Stripe.Subscription & { current_period_end?: number }
  ).current_period_end;

  await dbClient
    .update(users)
    .set({
      subscriptionTier: tier,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: status,
      subscriptionPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
}

/**
 * Create a Stripe customer for a user
 * @param stripeInstance Optional Stripe client (for tests); uses getStripe() when omitted
 * @returns Stripe customer ID
 */
export async function createCustomer(
  userId: string,
  email: string,
  stripeInstance?: Stripe,
  dbClient: DbClient = getDb()
): Promise<string> {
  const stripe = stripeInstance ?? getStripe();
  return dbClient.transaction(async (tx) => {
    // Serialize customer provisioning per user to avoid duplicate Stripe
    // customers when checkout is triggered concurrently.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${CUSTOMER_PROVISION_LOCK_KEY}, hashtext(${userId}))`
    );

    const [existingUser] = await tx
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (existingUser?.stripeCustomerId) {
      return existingUser.stripeCustomerId;
    }

    const stripeCallStartedAt = Date.now();
    const customer = await stripe.customers.create(
      {
        email,
        metadata: {
          userId,
        },
      },
      {
        timeout: CUSTOMER_PROVISION_REQUEST_TIMEOUT_MS,
      }
    );
    const stripeCallDurationMs = Date.now() - stripeCallStartedAt;

    if (stripeCallDurationMs > CUSTOMER_PROVISION_WARN_THRESHOLD_MS) {
      logger.warn(
        {
          userId,
          stripeCallDurationMs,
          timeoutMs: CUSTOMER_PROVISION_REQUEST_TIMEOUT_MS,
        },
        'Stripe customer creation inside advisory lock exceeded warning threshold'
      );
    }

    await tx
      .update(users)
      .set({
        stripeCustomerId: customer.id,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return customer.id;
  });
}

/**
 * Generate billing portal URL for customer
 * @param customerId Stripe customer ID
 * @param returnUrl URL to return to after portal session
 * @param stripeInstance Optional Stripe client (for tests); uses getStripe() when omitted
 * @returns Portal session URL
 */
export async function getCustomerPortalUrl(
  customerId: string,
  returnUrl: string,
  stripeInstance?: Stripe
): Promise<string> {
  const stripe = stripeInstance ?? getStripe();

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session.url;
}

/**
 * Cancel a subscription and downgrade user to free tier
 * @param stripeInstance Optional Stripe client (for tests); uses getStripe() when omitted
 */
export async function cancelSubscription(
  userId: string,
  stripeInstance?: Stripe,
  dbClient: DbClient = getDb()
): Promise<void> {
  const [user] = await dbClient
    .select({ stripeSubscriptionId: users.stripeSubscriptionId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.stripeSubscriptionId) {
    throw new Error('No active subscription found');
  }

  const stripe = stripeInstance ?? getStripe();

  // Cancel subscription at period end
  await stripe.subscriptions.update(user.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
}
