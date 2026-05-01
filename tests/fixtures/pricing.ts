import type { BillingCatalogTierData } from '@/features/billing/catalog-read';
import type { SubscriptionTier } from '@/shared/types/billing.types';

const DEFAULT_STRIPE_TIER_DATA: Record<
  SubscriptionTier,
  BillingCatalogTierData
> = {
  free: { name: 'Free', amount: '$0' },
  starter: { name: 'Starter', amount: '$9' },
  pro: { name: 'Pro', amount: '$29' },
};

function createMockStripeData(
  key: SubscriptionTier,
  overrides: Partial<BillingCatalogTierData> = {},
): BillingCatalogTierData {
  return {
    ...DEFAULT_STRIPE_TIER_DATA[key],
    ...overrides,
  };
}

export function createStripeTierMap(
  keys: SubscriptionTier[],
): Map<SubscriptionTier, BillingCatalogTierData> {
  return new Map(
    keys.map((key): [SubscriptionTier, BillingCatalogTierData] => [
      key,
      createMockStripeData(key),
    ]),
  );
}
