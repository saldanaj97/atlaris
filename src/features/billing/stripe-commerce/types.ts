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
 * Webhook HTTP boundary input after route-level transport checks. `signatureHeader` is
 * required; `DefaultStripeCommerceBoundary.acceptWebhook` verifies it through StripeGateway
 * before applying verified events.
 */
export type AcceptWebhookInput = {
  rawBody: string;
  signatureHeader: string;
  contentLength?: number | null;
  logger: import('@/lib/logging/logger').Logger;
};

/**
 * App-facing Stripe commerce boundary: checkout, portal, and webhook ingestion.
 */
export interface StripeCommerceBoundary {
  beginCheckout(input: BeginCheckoutInput): Promise<{ sessionUrl: string }>;
  openPortal(input: OpenPortalInput): Promise<{ portalUrl: string }>;
  acceptWebhook(input: AcceptWebhookInput): Promise<StripeWebhookResponse>;
}
