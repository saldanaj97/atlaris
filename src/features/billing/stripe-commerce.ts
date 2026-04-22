/**
 * Public Stripe commerce surface (issue #306). Prefer importing from this module
 * for portal eligibility re-exports and the commerce boundary factory.
 */

export { canOpenBillingPortalForUser } from '@/features/billing/portal-eligibility';
export {
	createStripeCommerceBoundary,
	getBillingStripeClient,
	getStripeCommerceBoundary,
	isLocalStripeCompletionRouteEnabled,
} from '@/features/billing/stripe-commerce/factory';
export type {
	AcceptWebhookInput,
	BeginCheckoutInput,
	OpenPortalInput,
	StripeCommerceBoundary,
	StripeWebhookResponse,
	SubscriptionStatus,
} from '@/features/billing/stripe-commerce/types';
