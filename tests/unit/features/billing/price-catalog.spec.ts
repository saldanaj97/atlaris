import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('checkout price catalog parity', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('paid marketing price ids are allowed for checkout in live mode', async () => {
    vi.stubEnv('STRIPE_LOCAL_MODE', 'false');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture');
    vi.stubEnv('STRIPE_STARTER_MONTHLY_PRICE_ID', 'price_starter_monthly_x');
    vi.stubEnv('STRIPE_PRO_MONTHLY_PRICE_ID', 'price_pro_monthly_x');
    vi.stubEnv('STRIPE_STARTER_YEARLY_PRICE_ID', 'price_starter_yearly_x');
    vi.stubEnv('STRIPE_PRO_YEARLY_PRICE_ID', 'price_pro_yearly_x');

    vi.resetModules();

    const { MONTHLY_TIER_CONFIGS, YEARLY_TIER_CONFIGS } =
      await import('@/app/(marketing)/pricing/components/pricing-config');
    const { getAllowedCheckoutPriceIds, isAllowedCheckoutPriceId } =
      await import('@/features/billing/price-catalog');

    const paidIds = [...MONTHLY_TIER_CONFIGS, ...YEARLY_TIER_CONFIGS]
      .map((c) => c.priceId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const allowed = getAllowedCheckoutPriceIds();
    for (const id of paidIds) {
      expect(isAllowedCheckoutPriceId(id)).toBe(true);
      expect(allowed).toContain(id);
    }
  });
});
