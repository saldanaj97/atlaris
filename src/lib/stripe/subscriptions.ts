import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { getStripe } from './client';

/**
 * Get user's subscription tier from database
 */
export async function getSubscriptionTier(userId: string) {
  const [user] = await db
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
 */
export async function syncSubscriptionToDb(
  subscription: Stripe.Subscription
): Promise<void> {
  const stripe = getStripe();
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  // Find user by Stripe customer ID
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);

  if (!user) {
    console.error(
      `No user found for Stripe customer ID: ${customerId}. Skipping sync.`
    );
    return;
  }

  // Determine subscription tier from price metadata
  const priceId =
    typeof subscription.items.data[0]?.price === 'string'
      ? subscription.items.data[0].price
      : subscription.items.data[0]?.price.id;

  let tier: 'free' | 'starter' | 'pro' = 'free';

  if (priceId) {
    try {
      const price = await stripe.prices.retrieve(priceId, {
        expand: ['product'],
      });

      const product = price.product as Stripe.Product;
      const tierMetadata = product.metadata?.tier;

      if (tierMetadata === 'starter' || tierMetadata === 'pro') {
        tier = tierMetadata;
      }
    } catch (error) {
      console.error('Error retrieving price/product:', error);
    }
  }

  // Map Stripe subscription status to our enum
  const statusMap: Record<
    Stripe.Subscription.Status,
    'active' | 'canceled' | 'past_due' | 'trialing' | null
  > = {
    active: 'active',
    canceled: 'canceled',
    incomplete: null, // Don't update to incomplete
    incomplete_expired: null,
    past_due: 'past_due',
    trialing: 'trialing',
    unpaid: 'past_due',
    paused: 'canceled',
  };

  const status = statusMap[subscription.status];

  // Get period end timestamp (type assertion needed for API version compatibility)
  const periodEnd = (subscription as unknown as { current_period_end?: number })
    .current_period_end;

  // Update user record
  await db
    .update(users)
    .set({
      subscriptionTier: tier,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: status,
      subscriptionPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
}

/**
 * Create a Stripe customer for a user
 * @returns Stripe customer ID
 */
export async function createCustomer(
  userId: string,
  email: string
): Promise<string> {
  const stripe = getStripe();

  // Check if user already has a Stripe customer ID
  const [existingUser] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (existingUser?.stripeCustomerId) {
    return existingUser.stripeCustomerId;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    metadata: {
      userId,
    },
  });

  // Update user record with Stripe customer ID
  await db
    .update(users)
    .set({
      stripeCustomerId: customer.id,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return customer.id;
}

/**
 * Generate billing portal URL for customer
 * @param customerId Stripe customer ID
 * @param returnUrl URL to return to after portal session
 * @returns Portal session URL
 */
export async function getCustomerPortalUrl(
  customerId: string,
  returnUrl: string
): Promise<string> {
  const stripe = getStripe();

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session.url;
}

/**
 * Cancel a subscription and downgrade user to free tier
 */
export async function cancelSubscription(userId: string): Promise<void> {
  const [user] = await db
    .select({ stripeSubscriptionId: users.stripeSubscriptionId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.stripeSubscriptionId) {
    throw new Error('No active subscription found');
  }

  const stripe = getStripe();

  // Cancel subscription at period end
  await stripe.subscriptions.update(user.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
}
