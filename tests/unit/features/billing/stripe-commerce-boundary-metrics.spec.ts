import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/billing/subscriptions', () => ({
  createCustomer: vi.fn().mockResolvedValue('cus_123'),
}));

vi.mock('@/lib/observability/metrics', () => ({
  countMetric: vi.fn(),
}));

import { DefaultStripeCommerceBoundary } from '@/features/billing/stripe-commerce/boundary-impl';
import type { StripeGateway } from '@/features/billing/stripe-commerce/gateway';
import { LOCAL_PRICE_IDS } from '@/features/billing/local-catalog';
import { countMetric } from '@/lib/observability/metrics';

function createGateway(): StripeGateway {
  return {
    createCheckoutSession: vi.fn().mockResolvedValue({
      url: 'https://checkout.stripe.com/c/session',
    }),
    createBillingPortalSession: vi.fn().mockResolvedValue({
      url: 'https://billing.stripe.com/session',
    }),
    constructWebhookEvent: vi.fn(),
    retrieveSubscription: vi.fn(),
    getStripeClient: vi.fn(),
  } as unknown as StripeGateway;
}

function createBoundary(params: { localMode?: boolean } = {}) {
  return new DefaultStripeCommerceBoundary({
    gateway: createGateway(),
    localMode: params.localMode ?? false,
    getDb: vi.fn() as never,
    privilegedDb: {
      customerProvisioningDb: {} as never,
      webhookEventDb: {} as never,
    },
    users: {} as never,
    webhookSecret: 'whsec_test',
    webhookDevMode: false,
    isProduction: false,
    isDevOrTest: true,
  });
}

describe('Stripe commerce metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits a checkout-session metric after Stripe returns a session URL', async () => {
    const boundary = createBoundary({ localMode: true });

    await boundary.beginCheckout({
      actor: { userId: 'user-1', email: 'user@example.com' },
      priceId: LOCAL_PRICE_IDS.starterMonthly,
    });

    expect(countMetric).toHaveBeenCalledWith(
      'atlaris.billing.checkout_session.created',
      1,
      {
        attributes: {
          mode: 'local',
        },
      },
    );
  });

  it('emits a portal-session metric after Stripe returns a portal URL', async () => {
    const boundary = createBoundary();

    await boundary.openPortal({
      actor: {
        userId: 'user-1',
        stripeCustomerId: 'cus_123',
        subscriptionStatus: 'active',
      },
    });

    expect(countMetric).toHaveBeenCalledWith(
      'atlaris.billing.portal_session.created',
      1,
      {
        attributes: {
          subscription_status: 'active',
        },
      },
    );
  });
});
