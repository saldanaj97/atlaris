import { stripeEnv } from '@/lib/config/env';
import type { SubscriptionTier } from '@/shared/types/billing.types';

export interface StripeTierConfig {
  key: SubscriptionTier;
  priceId?: string | null;
}

export const MONTHLY_TIER_CONFIGS: StripeTierConfig[] = [
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

export const YEARLY_TIER_CONFIGS: StripeTierConfig[] = [
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
