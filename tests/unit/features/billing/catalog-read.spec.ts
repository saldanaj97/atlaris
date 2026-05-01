import { describe, expect, it, vi } from 'vitest';
import {
  type BillingCatalogStripeClient,
  readBillingCatalogTierData,
} from '@/features/billing/catalog-read';
import { LOCAL_PRICE_IDS } from '@/features/billing/local-catalog';
import { buildMockLocalStripePrice } from '@/features/billing/stripe-commerce/local-gateway';

describe('readBillingCatalogTierData', () => {
  function baseLogger() {
    return { error: vi.fn(), warn: vi.fn() };
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
