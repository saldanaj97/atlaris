import { stripeEnv } from '@/lib/config/env';
import { MONTHLY_TIER_CONFIGS } from './pricing-config';
import { PricingGrid } from './PricingGrid';
import { PricingMissingStripeNotice } from './PricingMissingStripeNotice';
import { fetchStripeTierData } from './stripe-pricing';

export default async function MonthlyPricingCards() {
  const { starterMonthly, proMonthly } = stripeEnv.pricing;
  const missingPrices = !starterMonthly || !proMonthly;

  const stripeData = missingPrices
    ? new Map()
    : await fetchStripeTierData({
        starterId: starterMonthly ?? '',
        proId: proMonthly ?? '',
      });

  return (
    <div className="bg-background container mx-auto px-6 py-8">
      {missingPrices ? <PricingMissingStripeNotice /> : null}
      <PricingGrid
        configs={MONTHLY_TIER_CONFIGS}
        intervalLabel="/ month"
        stripeData={stripeData}
        subscribeLabel="Subscribe Monthly"
      />
    </div>
  );
}
