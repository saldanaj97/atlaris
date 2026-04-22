import type Stripe from 'stripe';
import type {
	CommerceSubscriptionSnapshot,
	CommerceWebhookEvent,
} from '@/features/billing/stripe-commerce/dtos';

/**
 * Stripe SDK port used by the commerce boundary (live, local mock, or test fake).
 */
export interface StripeGateway {
	createCheckoutSession(input: {
		customerId: string;
		priceId: string;
		successUrl: string;
		cancelUrl: string;
	}): Promise<{ url: string | null }>;

	createBillingPortalSession(input: {
		customerId: string;
		returnUrl: string;
	}): Promise<{ url: string | null }>;

	constructWebhookEvent(input: {
		rawBody: string;
		signature: string;
		secret: string;
		toleranceSeconds?: number;
	}): CommerceWebhookEvent;

	retrieveSubscription(input: {
		subscriptionId: string;
		timeoutMs?: number;
	}): Promise<CommerceSubscriptionSnapshot>;

	/** Underlying Stripe client for webhook side effects (e.g. invoice resync). */
	getStripeClient(): Stripe;
}
