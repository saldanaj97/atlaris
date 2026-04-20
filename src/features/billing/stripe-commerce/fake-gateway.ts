import type Stripe from 'stripe';
import type {
  CommerceSubscriptionSnapshot,
  CommerceWebhookEvent,
} from '@/features/billing/stripe-commerce/dtos';
import type { StripeGateway } from '@/features/billing/stripe-commerce/gateway';

/**
 * Test-only Stripe gateway with overridable async fns.
 */
export class FakeStripeGateway implements StripeGateway {
  getStripeClient: () => Stripe;

  createCheckoutSession = async (): Promise<{ url: string | null }> => ({
    url: 'https://example.test/checkout',
  });

  createBillingPortalSession = async (): Promise<{ url: string | null }> => ({
    url: 'https://example.test/portal',
  });

  constructWebhookEvent = (): CommerceWebhookEvent => {
    throw new Error('FakeStripeGateway.constructWebhookEvent not configured');
  };

  retrieveSubscription = async (): Promise<CommerceSubscriptionSnapshot> => {
    throw new Error('FakeStripeGateway.retrieveSubscription not configured');
  };

  constructor(stripe: Stripe) {
    this.getStripeClient = () => stripe;
  }
}
