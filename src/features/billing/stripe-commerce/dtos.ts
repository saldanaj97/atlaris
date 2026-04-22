import type Stripe from 'stripe';

/**
 * Normalized subscription snapshot returned by gateway subscription reads.
 * Keeps Stripe SDK shapes off the gateway seam.
 */
export type CommerceSubscriptionSnapshot = {
	subscriptionId: string;
	customerId: string;
	status: Stripe.Subscription.Status;
	currentPeriodEnd: Date | null;
	cancelAtPeriodEnd: boolean;
	/** First recurring price id on the subscription, if present. */
	primaryPriceId: string | null;
};

/**
 * Verified webhook payload. Wraps the Stripe event for dispatch while keeping
 * the gateway return type explicit.
 */
export type CommerceWebhookEvent = {
	stripeEvent: Stripe.Event;
};
