import { stripeEnv } from '@/lib/config/env';
import type { TierKey } from './PricingTiers';

export interface TierConfig {
  key: TierKey;
  priceId?: string | null;
}

export const MONTHLY_TIER_CONFIGS: TierConfig[] = [
  { key: 'free' },
  {
    key: 'starter',
    priceId: stripeEnv.pricing.starterMonthly,
  },
  {
    key: 'pro',
    priceId: stripeEnv.pricing.proMonthly,
  },
];

export const YEARLY_TIER_CONFIGS: TierConfig[] = [
  { key: 'free' },
  {
    key: 'starter',
    priceId: stripeEnv.pricing.starterYearly,
  },
  {
    key: 'pro',
    priceId: stripeEnv.pricing.proYearly,
  },
];
