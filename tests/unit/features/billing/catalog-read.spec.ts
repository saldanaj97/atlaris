import {
  type BillingCatalogStripeClient,
  readBillingCatalogTierEntries,
  readBillingCatalogTierData,
} from '@/features/billing/catalog-read';
import { LOCAL_PRICE_IDS } from '@/features/billing/local-catalog';
import { buildMockLocalStripePrice } from '@/features/billing/stripe-commerce/local-gateway';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const productionMocks = vi.hoisted(() => {
  const cacheStore = new Map<string, unknown>();
  return {
    cacheStore,
    retrievePrice: vi.fn(),
    retrieveProduct: vi.fn(),
    unstableCache: vi.fn(
      (reader: (...args: unknown[]) => Promise<unknown>, _keyParts: string[]) =>
        async (...args: unknown[]) => {
          const key = JSON.stringify(args);
          if (!cacheStore.has(key)) {
            cacheStore.set(key, await reader(...args));
          }
          return cacheStore.get(key);
        },
    ),
  };
});

vi.mock('next/cache', () => ({
  unstable_cache: productionMocks.unstableCache,
}));

vi.mock('@/features/billing/client', () => ({
  getStripe: () => ({
    prices: { retrieve: productionMocks.retrievePrice },
    products: { retrieve: productionMocks.retrieveProduct },
  }),
}));

describe('readBillingCatalogTierData', () => {
  beforeEach(() => {
    productionMocks.cacheStore.clear();
    productionMocks.retrievePrice.mockReset();
    productionMocks.retrieveProduct.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  function baseLogger() {
    return { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
  }

  function emptyStripe(): BillingCatalogStripeClient {
    return {
      retrievePrice: vi.fn(),
      retrieveProduct: vi.fn(),
    } as BillingCatalogStripeClient;
  }

  it('local monthly uses canonical display amounts', async () => {
    const logger = baseLogger();
    const stripe = emptyStripe();
    const map = await readBillingCatalogTierData(
      {
        interval: 'monthly',
        starterId: LOCAL_PRICE_IDS.starterMonthly,
        proId: LOCAL_PRICE_IDS.proMonthly,
      },
      { localMode: true, stripe, logger },
    );
    expect(map.get('starter')).toEqual({
      amount: '$12',
      name: 'Starter',
    });
    expect(map.get('pro')).toEqual({
      amount: '$29',
      name: 'Pro',
    });
    expect(stripe.retrievePrice).not.toHaveBeenCalled();
  });

  it('local yearly uses canonical display amounts', async () => {
    const logger = baseLogger();
    const stripe = emptyStripe();
    const map = await readBillingCatalogTierData(
      {
        interval: 'yearly',
        starterId: LOCAL_PRICE_IDS.starterYearly,
        proId: LOCAL_PRICE_IDS.proYearly,
      },
      { localMode: true, stripe, logger },
    );
    expect(map.get('starter')).toEqual({
      amount: '$99',
      name: 'Starter',
    });
    expect(map.get('pro')).toEqual({
      amount: '$249',
      name: 'Pro',
    });
  });

  it('local mode does not require injected Stripe deps', async () => {
    const map = await readBillingCatalogTierData(
      {
        interval: 'monthly',
        starterId: LOCAL_PRICE_IDS.starterMonthly,
        proId: LOCAL_PRICE_IDS.proMonthly,
      },
      { localMode: true },
    );

    expect(map.get('starter')?.amount).toBe('$12');
    expect(map.get('pro')?.amount).toBe('$29');
  });

  it('local mode omits tier on unknown price id', async () => {
    const logger = baseLogger();
    const stripe = emptyStripe();
    const map = await readBillingCatalogTierData(
      {
        interval: 'monthly',
        starterId: 'price_unknown_not_local',
        proId: LOCAL_PRICE_IDS.proMonthly,
      },
      { localMode: true, stripe, logger },
    );
    expect(map.has('starter')).toBe(false);
    expect(map.get('pro')?.amount).toBe('$29');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('live mode returns Stripe product names and formatted amounts', async () => {
    const logger = baseLogger();
    const stripe = {
      retrievePrice: vi.fn().mockImplementation(async (priceId: string) => ({
        currency: 'usd',
        unit_amount: priceId === 'ps' ? 1200 : 2900,
        product: priceId === 'ps' ? 'prod_s' : 'prod_p',
      })),
      retrieveProduct: vi.fn().mockImplementation(async (pid: string) => {
        if (pid === 'prod_s') return { deleted: false, name: 'Starter Live' };
        return { deleted: false, name: 'Pro Live' };
      }),
    } as BillingCatalogStripeClient;

    const map = await readBillingCatalogTierData(
      {
        interval: 'monthly',
        starterId: 'ps',
        proId: 'pp',
      },
      { localMode: false, stripe, logger },
    );

    expect(map.get('starter')).toEqual({
      amount: '$12.00',
      name: 'Starter Live',
    });
    expect(map.get('pro')).toEqual({
      amount: '$29.00',
      name: 'Pro Live',
    });
    expect(stripe.retrieveProduct).toHaveBeenCalledTimes(2);
  });

  it('live omits tier with invalid shape but keeps sibling', async () => {
    const logger = baseLogger();
    const stripe = {
      retrievePrice: vi
        .fn()
        .mockResolvedValueOnce({
          currency: 'usd',
          unit_amount: 1200,
          product: 'prod_s',
        })
        .mockResolvedValueOnce({
          currency: 'usd',
          unit_amount: undefined,
          product: 'prod_p',
        }),
      retrieveProduct: vi.fn().mockResolvedValue({
        deleted: false,
        name: 'Ok',
      }),
    } as BillingCatalogStripeClient;

    const map = await readBillingCatalogTierData(
      {
        interval: 'monthly',
        starterId: 'ps',
        proId: 'pp',
      },
      { localMode: false, stripe, logger },
    );

    expect(map.size).toBe(1);
    expect(map.has('starter')).toBe(true);
    expect(map.has('pro')).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('deleted product falls back and warns', async () => {
    const logger = baseLogger();
    const stripe = {
      retrievePrice: vi
        .fn()
        .mockResolvedValueOnce({
          currency: 'usd',
          unit_amount: 1200,
          product: 'prod_s',
        })
        .mockResolvedValueOnce({
          currency: 'usd',
          unit_amount: 2900,
          product: 'prod_p',
        }),
      retrieveProduct: vi
        .fn()
        .mockResolvedValueOnce({
          deleted: false,
          name: 'Starter Fine',
        })
        .mockResolvedValueOnce({ deleted: true as const }),
    } as BillingCatalogStripeClient;

    const map = await readBillingCatalogTierData(
      {
        interval: 'monthly',
        starterId: 'ps',
        proId: 'pp',
      },
      { localMode: false, stripe, logger },
    );

    expect(map.get('starter')?.name).toBe('Starter Fine');
    expect(map.get('pro')?.name).toBe('Pro');
    expect(map.get('pro')?.amount).toBe('$29.00');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('expanded product avoids product retrieve', async () => {
    const logger = baseLogger();
    const stripe = {
      retrievePrice: vi
        .fn()
        .mockImplementationOnce(async () => ({
          currency: 'usd',
          unit_amount: 1200,
          product: { deleted: false, name: 'Inline Starter' },
        }))
        .mockImplementationOnce(async () => ({
          currency: 'usd',
          unit_amount: 2900,
          product: { deleted: false, name: 'Inline Pro' },
        })),
      retrieveProduct: vi.fn(),
    } as BillingCatalogStripeClient;

    const map = await readBillingCatalogTierData(
      {
        interval: 'monthly',
        starterId: 'ps',
        proId: 'pp',
      },
      { localMode: false, stripe, logger },
    );

    expect(stripe.retrieveProduct).not.toHaveBeenCalled();
    expect(map.get('starter')?.name).toBe('Inline Starter');
    expect(map.get('pro')?.name).toBe('Inline Pro');
  });

  it('reuses serializable production catalog entries for the same input', async () => {
    vi.stubGlobal('window', undefined);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_LOCAL_MODE', 'false');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_catalog_cache');
    productionMocks.retrievePrice.mockImplementation(
      async (priceId: string) => ({
        currency: 'usd',
        unit_amount: priceId === 'ps' ? 1_200 : 2_900,
        product: priceId === 'ps' ? 'prod_s' : 'prod_p',
      }),
    );
    productionMocks.retrieveProduct.mockImplementation(
      async (productId: string) => ({
        deleted: false,
        name: productId === 'prod_s' ? 'Starter Cached' : 'Pro Cached',
      }),
    );
    const input = {
      interval: 'monthly' as const,
      starterId: 'ps',
      proId: 'pp',
    };

    const first = await readBillingCatalogTierEntries(input);
    const second = await readBillingCatalogTierEntries(input);

    expect(second).toEqual(first);
    expect(Array.isArray(first)).toBe(true);
    expect(productionMocks.retrievePrice).toHaveBeenCalledTimes(2);
    expect(productionMocks.retrieveProduct).toHaveBeenCalledTimes(2);
    expect(productionMocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ['stripe-pricing-catalog-v1'],
      { tags: ['stripe-pricing-catalog'], revalidate: 3_600 },
    );
  });

  it('keeps injected entry reads uncached in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const logger = baseLogger();
    const stripe = {
      retrievePrice: vi.fn(async (priceId: string) => ({
        currency: 'usd',
        unit_amount: priceId === 'ps' ? 1_200 : 2_900,
        product: { deleted: false, name: priceId },
      })),
      retrieveProduct: vi.fn(),
    } satisfies BillingCatalogStripeClient;
    const input = {
      interval: 'monthly' as const,
      starterId: 'ps',
      proId: 'pp',
    };

    await readBillingCatalogTierEntries(input, {
      localMode: false,
      stripe,
      logger,
    });
    await readBillingCatalogTierEntries(input, {
      localMode: false,
      stripe,
      logger,
    });

    expect(stripe.retrievePrice).toHaveBeenCalledTimes(4);
  });
});

describe('buildMockLocalStripePrice', () => {
  it('returns yearly unit_amount matching canonical catalog cents', () => {
    expect(
      buildMockLocalStripePrice(LOCAL_PRICE_IDS.starterYearly).unit_amount,
    ).toBe(9900);
    expect(
      buildMockLocalStripePrice(LOCAL_PRICE_IDS.proYearly).unit_amount,
    ).toBe(24900);
  });
});
