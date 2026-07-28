import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('pricing-config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns null paid price ids when Stripe env is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_LOCAL_MODE', 'false');

    const { getMonthlyTierConfigs, getYearlyTierConfigs } =
      await import('@/app/(marketing)/pricing/components/pricing-config');

    expect(getMonthlyTierConfigs()).toEqual([
      { key: 'free' },
      { key: 'starter', priceId: null },
      { key: 'pro', priceId: null },
    ]);
    expect(getYearlyTierConfigs()).toEqual([
      { key: 'free' },
      { key: 'starter', priceId: null },
      { key: 'pro', priceId: null },
    ]);
  });

  it('reads configured Stripe price ids in live mode', async () => {
    vi.stubEnv('STRIPE_LOCAL_MODE', 'false');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture');
    vi.stubEnv('STRIPE_STARTER_MONTHLY_PRICE_ID', 'price_starter_monthly_x');
    vi.stubEnv('STRIPE_PRO_MONTHLY_PRICE_ID', 'price_pro_monthly_x');
    vi.stubEnv('STRIPE_STARTER_YEARLY_PRICE_ID', 'price_starter_yearly_x');
    vi.stubEnv('STRIPE_PRO_YEARLY_PRICE_ID', 'price_pro_yearly_x');

    const { getMonthlyTierConfigs, getYearlyTierConfigs } =
      await import('@/app/(marketing)/pricing/components/pricing-config');

    expect(getMonthlyTierConfigs()).toEqual([
      { key: 'free' },
      { key: 'starter', priceId: 'price_starter_monthly_x' },
      { key: 'pro', priceId: 'price_pro_monthly_x' },
    ]);
    expect(getYearlyTierConfigs()).toEqual([
      { key: 'free' },
      { key: 'starter', priceId: 'price_starter_yearly_x' },
      { key: 'pro', priceId: 'price_pro_yearly_x' },
    ]);
  });
});
