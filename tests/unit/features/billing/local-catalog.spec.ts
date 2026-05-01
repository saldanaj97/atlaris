import { describe, expect, it } from 'vitest';
import {
  LOCAL_PRICE_IDS,
  localCatalogEntryForTierInterval,
  localCatalogEntryFromPriceId,
  localDisplayAmountForTier,
} from '@/features/billing/local-catalog';

describe('local-catalog', () => {
  const cases = [
    {
      priceIdKey: 'starterMonthly' as const,
      tier: 'starter',
      interval: 'monthly',
      cents: 1200,
      amount: '$12',
    },
    {
      priceIdKey: 'starterYearly',
      tier: 'starter',
      interval: 'yearly',
      cents: 9900,
      amount: '$99',
    },
    {
      priceIdKey: 'proMonthly',
      tier: 'pro',
      interval: 'monthly',
      cents: 2900,
      amount: '$29',
    },
    {
      priceIdKey: 'proYearly',
      tier: 'pro',
      interval: 'yearly',
      cents: 24900,
      amount: '$249',
    },
  ] as const;

  it.each(cases)(
    '$priceIdKey resolves to tier / interval / cents / displayAmount',
    ({ priceIdKey, tier, interval, cents, amount }) => {
      const priceId = LOCAL_PRICE_IDS[priceIdKey];
      const fromId = localCatalogEntryFromPriceId(priceId);
      const fromTier = localCatalogEntryForTierInterval(tier, interval);
      expect(fromId).toEqual(fromTier);
      expect(fromId?.tier).toBe(tier);
      expect(fromId?.interval).toBe(interval);
      expect(fromId?.currency).toBe('usd');
      expect(fromId?.unitAmount).toBe(cents);
      expect(fromId?.displayAmount).toBe(amount);
      expect(localDisplayAmountForTier(tier, interval)).toBe(amount);
    },
  );
});
