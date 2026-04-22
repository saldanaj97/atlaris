import type Stripe from 'stripe';
import type { SubscriptionStatus } from '@/features/billing/stripe-commerce';

/**
 * Maps Stripe subscription lifecycle statuses to persisted subscription status
 * values (or null when we intentionally avoid overwriting the row).
 */
export function mapStripeSubscriptionStatus(
	status: Stripe.Subscription.Status,
): SubscriptionStatus {
	const statusMap: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
		active: 'active',
		canceled: 'canceled',
		incomplete: null,
		incomplete_expired: null,
		past_due: 'past_due',
		trialing: 'trialing',
		unpaid: 'past_due',
		paused: 'canceled',
	};

	return statusMap[status];
}
