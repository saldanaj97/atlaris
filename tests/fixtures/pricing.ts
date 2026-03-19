import type { TierKey } from '@/app/pricing/components/PricingTiers';
import type { TierConfig } from '@/app/pricing/components/pricing-config';
import type { StripeTierData } from '@/app/pricing/components/stripe-pricing';

type TierConfigByKey = {
  [K in TierKey]: TierConfig & { key: K };
};

const DEFAULT_TIER_CONFIGS = {
  free: { key: 'free' },
  starter: { key: 'starter', priceId: 'price_starter_monthly' },
  pro: { key: 'pro', priceId: 'price_pro_monthly' },
} satisfies TierConfigByKey;

const DEFAULT_STRIPE_TIER_DATA: Record<TierKey, StripeTierData> = {
  free: { name: 'Free', amount: '$0' },
  starter: { name: 'Starter', amount: '$9' },
  pro: { name: 'Pro', amount: '$29' },
};

export function createMockTierConfig<K extends TierKey>(
  key: K,
  overrides: Partial<TierConfigByKey[K]> = {}
): TierConfigByKey[K] {
  return {
    ...DEFAULT_TIER_CONFIGS[key],
    ...overrides,
  };
}

export function createTierConfigs(keys: TierKey[]): TierConfig[] {
  return keys.map((key) => createMockTierConfig(key));
}

export function createMockStripeData(
  key: TierKey,
  overrides: Partial<StripeTierData> = {}
): StripeTierData {
  return {
    ...DEFAULT_STRIPE_TIER_DATA[key],
    ...overrides,
  };
}

export function createStripeTierMap(
  keys: TierKey[]
): Map<TierKey, StripeTierData> {
  return new Map(
    keys.map((key): [TierKey, StripeTierData] => [
      key,
      createMockStripeData(key),
    ])
  );
}
