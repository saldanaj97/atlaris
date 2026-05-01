// fallow-ignore-file unused-class-member
import Stripe from 'stripe';
import type { CommerceWebhookEvent } from '@/features/billing/stripe-commerce/dtos';
import type { StripeGateway } from '@/features/billing/stripe-commerce/gateway';
import { stripeSubscriptionToCommerceSnapshot } from '@/features/billing/stripe-commerce/subscription-snapshot';

export class LiveStripeGateway implements StripeGateway {
  constructor(private readonly stripe: Stripe) {}

  getStripeClient(): Stripe {
    return this.stripe;
  }

  async createCheckoutSession(input: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string | null }> {
    const session = await this.stripe.checkout.sessions.create({
      customer: input.customerId,
      line_items: [
        {
          price: input.priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    return { url: session.url };
  }

  async createBillingPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string | null }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    return { url: session.url };
  }

  constructWebhookEvent(input: {
    rawBody: string;
    signature: string;
    secret: string;
    toleranceSeconds?: number;
  }): CommerceWebhookEvent {
    const event = Stripe.webhooks.constructEvent(
      input.rawBody,
      input.signature,
      input.secret,
      input.toleranceSeconds ?? 300,
    );
    return { stripeEvent: event };
  }

  async retrieveSubscription(input: {
    subscriptionId: string;
    timeoutMs?: number;
  }) {
    const subscription = await this.stripe.subscriptions.retrieve(
      input.subscriptionId,
      { timeout: input.timeoutMs ?? 10_000 },
    );
    return stripeSubscriptionToCommerceSnapshot(subscription);
  }
}
