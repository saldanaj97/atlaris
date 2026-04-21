import type Stripe from 'stripe';
import type { CommerceSubscriptionSnapshot } from '@/features/billing/stripe-commerce/dtos';

/**
 * Maps a Stripe subscription object into the commerce gateway snapshot shape.
 */
export function stripeSubscriptionToCommerceSnapshot(
  subscription: Stripe.Subscription
): CommerceSubscriptionSnapshot {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : (subscription.customer?.id ?? '');

  const periodEnd = (
    subscription as Stripe.Subscription & { current_period_end?: number }
  ).current_period_end;

  const firstItem = subscription.items?.data?.[0];
  const primaryPriceId =
    firstItem && typeof firstItem.price === 'string'
      ? firstItem.price
      : ((firstItem?.price as Stripe.Price | undefined)?.id ?? null);

  return {
    subscriptionId: subscription.id,
    customerId,
    status: subscription.status,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    primaryPriceId,
  };
}
