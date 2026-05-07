import Stripe from 'stripe';
import { localCatalogEntryFromPriceId } from '@/features/billing/local-catalog';
import { appEnv } from '@/lib/config/env';

let localStripeMock: Stripe | null = null;

const LOCAL_TIER_PRODUCT_NAMES: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
};

function localTierToProductName(tier: string): string {
  const mapped = LOCAL_TIER_PRODUCT_NAMES[tier];
  if (mapped) {
    return mapped;
  }
  if (tier.length === 0) {
    return 'Paid';
  }
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Stripe-shaped local price for tests and in-process mock `prices.retrieve`. */
export function buildMockLocalStripePrice(priceId: string): Stripe.Price {
  const entry = localCatalogEntryFromPriceId(priceId);
  if (!entry) {
    throw new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error',
      message: `No such price: ${priceId}`,
    });
  }
  const { tier } = entry;
  const productId = `prod_local_${tier}`;
  return {
    id: priceId,
    object: 'price',
    active: true,
    currency: entry.currency,
    product: {
      id: productId,
      object: 'product',
      name: localTierToProductName(tier),
      metadata: { tier },
    },
    unit_amount: entry.unitAmount,
  } as unknown as Stripe.Price;
}

function buildLocalStripeMock(baseUrl: string): Stripe {
  const normalizedBase = baseUrl.replace(/\/$/, '');

  const customers = {
    create: async (
      params: Stripe.CustomerCreateParams,
    ): Promise<Stripe.Customer> => {
      const meta = params.metadata;
      const userId =
        meta && typeof meta === 'object' && 'userId' in meta
          ? String(meta.userId)
          : 'unknown';
      return {
        id: `cus_local_${userId}`,
        object: 'customer',
      } as Stripe.Customer;
    },
  };

  const checkout = {
    sessions: {
      create: async (
        params: Stripe.Checkout.SessionCreateParams,
      ): Promise<Stripe.Checkout.Session> => {
        const lineItem = params.line_items?.[0];
        const priceId =
          lineItem &&
          typeof lineItem === 'object' &&
          'price' in lineItem &&
          typeof lineItem.price === 'string'
            ? lineItem.price
            : 'price_unknown';
        const sessionId = `cs_local_${randomSuffix()}`;
        let nextPath = '/settings/billing';
        if (params.success_url) {
          try {
            const u = new URL(params.success_url);
            nextPath = `${u.pathname}${u.search}`;
          } catch {
            // ignore invalid success_url
          }
        }
        const url = `${normalizedBase}/api/v1/stripe/local/complete-checkout?price_id=${encodeURIComponent(
          priceId,
        )}&session_id=${encodeURIComponent(sessionId)}&next=${encodeURIComponent(nextPath)}`;
        return {
          id: sessionId,
          object: 'checkout.session',
          url,
        } as Stripe.Checkout.Session;
      },
    },
  };

  const billingPortal = {
    sessions: {
      create: async (): Promise<Stripe.BillingPortal.Session> => {
        const url = `${normalizedBase}/settings/billing?local_portal=1`;
        return {
          id: `bps_local_${randomSuffix()}`,
          object: 'billing_portal.session',
          url,
        } as Stripe.BillingPortal.Session;
      },
    },
  };

  const prices = {
    retrieve: async (
      priceId: string,
      _params?: Stripe.PriceRetrieveParams,
    ): Promise<Stripe.Price> => buildMockLocalStripePrice(priceId),
  };

  const subscriptions = {
    retrieve: async (id: string): Promise<Stripe.Subscription> =>
      ({
        id,
        object: 'subscription',
        customer: `cus_local_${randomSuffix()}`,
        status: 'active',
        cancel_at_period_end: false,
        items: {
          data: [
            {
              price: {
                id: 'price_local_starter_monthly',
                object: 'price',
              },
            },
          ],
        },
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
      }) as unknown as Stripe.Subscription,
    update: async (
      id: string,
      _params: Stripe.SubscriptionUpdateParams,
    ): Promise<Stripe.Subscription> =>
      ({
        id,
        object: 'subscription',
        status: 'active',
      }) as Stripe.Subscription,
  };

  return {
    customers,
    checkout,
    billingPortal,
    prices,
    subscriptions,
  } as unknown as Stripe;
}

/**
 * Minimal Stripe mock for local billing (checkout, portal, price retrieve, cancel).
 */
export function getLocalStripeMock(baseUrl: string): Stripe {
  if (!localStripeMock) {
    localStripeMock = buildLocalStripeMock(baseUrl);
  }
  return localStripeMock;
}

/** Used by billing client; avoids importing env before app URL is available. */
export function resolveStripeClientBaseUrl(): string {
  return appEnv.url;
}
