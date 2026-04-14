import type { TierConfig } from '@/app/pricing/components/pricing-config';
import type { StripeTierData } from '@/app/pricing/components/stripe-pricing';
import type { SubscriptionTier } from '@/shared/types/billing.types';

type TierConfigByKey = {
  [K in SubscriptionTier]: TierConfig & { key: K };
};

const DEFAULT_TIER_CONFIGS = {
  free: { key: 'free' },
  starter: { key: 'starter', priceId: 'price_starter_monthly' },
  pro: { key: 'pro', priceId: 'price_pro_monthly' },
} satisfies TierConfigByKey;

const DEFAULT_STRIPE_TIER_DATA: Record<SubscriptionTier, StripeTierData> = {
  free: { name: 'Free', amount: '$0' },
  starter: { name: 'Starter', amount: '$9' },
  pro: { name: 'Pro', amount: '$29' },
};

export function createMockTierConfig<K extends SubscriptionTier>(
  key: K,
  overrides: Partial<TierConfigByKey[K]> = {}
): TierConfigByKey[K] {
  return {
    ...DEFAULT_TIER_CONFIGS[key],
    ...overrides,
  };
}

export function createTierConfigs(keys: SubscriptionTier[]): TierConfig[] {
  return keys.map((key) => createMockTierConfig(key));
}

export function createMockStripeData(
  key: SubscriptionTier,
  overrides: Partial<StripeTierData> = {}
): StripeTierData {
  return {
    ...DEFAULT_STRIPE_TIER_DATA[key],
    ...overrides,
  };
}

export function createStripeTierMap(
  keys: SubscriptionTier[]
): Map<SubscriptionTier, StripeTierData> {
  return new Map(
    keys.map((key): [SubscriptionTier, StripeTierData] => [
      key,
      createMockStripeData(key),
    ])
  );
}
