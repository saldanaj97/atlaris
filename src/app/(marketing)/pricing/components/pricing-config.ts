import type { SubscriptionTier } from '@/shared/types/billing.types';

import { stripeEnv } from '@/lib/config/env';
import { EnvValidationError } from '@/lib/config/env/shared';

export interface StripeTierConfig {
  key: SubscriptionTier;
  priceId?: string | null;
}

function resolvePriceId(read: () => string): string | null {
  try {
    return read();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      return null;
    }
    throw error;
  }
}

function buildTierConfigs(
  starterPriceId: () => string,
  proPriceId: () => string,
): StripeTierConfig[] {
  return [
    { key: 'free' },
    {
      key: 'starter',
      priceId: resolvePriceId(starterPriceId),
    },
    {
      key: 'pro',
      priceId: resolvePriceId(proPriceId),
    },
  ];
}

export function getMonthlyTierConfigs(): StripeTierConfig[] {
  return buildTierConfigs(
    () => stripeEnv.pricing.starterMonthly,
    () => stripeEnv.pricing.proMonthly,
  );
}

export function getYearlyTierConfigs(): StripeTierConfig[] {
  return buildTierConfigs(
    () => stripeEnv.pricing.starterYearly,
    () => stripeEnv.pricing.proYearly,
  );
}
