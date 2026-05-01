import { stripeEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function getAllowedCheckoutPriceIds(): string[] {
  const pricingValues = [
    stripeEnv.pricing.starterMonthly,
    stripeEnv.pricing.proMonthly,
    stripeEnv.pricing.starterYearly,
    stripeEnv.pricing.proYearly,
  ] as const;

  const allowed = pricingValues.filter(isNonEmptyString);

  if (allowed.length === 0) {
    logger.error(
      {
        allowed,
        pricingValues: {
          starterMonthly: stripeEnv.pricing.starterMonthly,
          proMonthly: stripeEnv.pricing.proMonthly,
          starterYearly: stripeEnv.pricing.starterYearly,
          proYearly: stripeEnv.pricing.proYearly,
        },
      },
      'Stripe pricing misconfigured: no valid checkout price IDs',
    );
    throw new Error('Stripe pricing misconfigured: no valid price IDs');
  }

  return allowed;
}

export function isAllowedCheckoutPriceId(priceId: string): boolean {
  return getAllowedCheckoutPriceIds().includes(priceId);
}
