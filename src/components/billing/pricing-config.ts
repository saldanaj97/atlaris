import { stripeEnv } from '@/lib/config/env';
import { type TierKey } from './PricingTiers';

export interface TierConfig {
  key: TierKey;
  priceId?: string | null;
  badgeVariant?: 'default' | 'secondary';
}

export const MONTHLY_TIER_CONFIGS: TierConfig[] = [
  { key: 'free' },
  {
    key: 'starter',
    priceId: stripeEnv.pricing.starterMonthly,
    badgeVariant: 'default',
  },
  {
    key: 'pro',
    priceId: stripeEnv.pricing.proMonthly,
    badgeVariant: 'secondary',
  },
];

export const YEARLY_TIER_CONFIGS: TierConfig[] = [
  { key: 'free' },
  {
    key: 'starter',
    priceId: stripeEnv.pricing.starterYearly,
    badgeVariant: 'default',
  },
  {
    key: 'pro',
    priceId: stripeEnv.pricing.proYearly,
    badgeVariant: 'secondary',
  },
];
