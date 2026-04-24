/**
 * Public commerce types for Stripe checkout, portal, and webhook handling.
 */

export type SubscriptionStatus =
	| 'active'
	| 'canceled'
	| 'past_due'
	| 'trialing'
	| null;

export type StripeWebhookResponse = {
	status: number;
	body: string;
	duplicate?: boolean;
};

export type BeginCheckoutInput = {
	actor: { userId: string; email: string };
	priceId: string;
	successUrl?: string;
	cancelUrl?: string;
};

export type OpenPortalInput = {
	actor: {
		userId: string;
		stripeCustomerId: string | null;
		subscriptionStatus: SubscriptionStatus;
	};
	returnUrl?: string;
};

/**
 * Webhook HTTP boundary input. Optional `stripe` is production-compatible: the handler may
 * pass a client so verified-event application can use `new LiveStripeGateway(stripe)` instead
 * of the boundary’s default `deps.gateway` (see `DefaultStripeCommerceBoundary.acceptWebhook`);
 * test harnesses inject mocks the same way. That route-level `Stripe` optional is a narrow
 * compatibility seam — consolidating injection behind `StripeGateway` only is a possible
 * future follow-up, not this cleanup step.
 */
export type AcceptWebhookInput = {
	rawBody: string;
	signatureHeader: string | null;
	contentLength?: number | null;
	logger: import('@/lib/logging/logger').Logger;
	stripe?: import('stripe').default;
};

/**
 * App-facing Stripe commerce boundary: checkout, portal, and webhook ingestion.
 */
export interface StripeCommerceBoundary {
	beginCheckout(input: BeginCheckoutInput): Promise<{ sessionUrl: string }>;
	openPortal(input: OpenPortalInput): Promise<{ portalUrl: string }>;
	acceptWebhook(input: AcceptWebhookInput): Promise<StripeWebhookResponse>;
}
