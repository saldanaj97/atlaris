import { stripeEnv } from '@/lib/config/env';
import { YEARLY_TIER_CONFIGS } from './pricing-config';
import { PricingGrid } from './PricingGrid';
import { PricingMissingStripeNotice } from './PricingMissingStripeNotice';
import { fetchStripeTierData } from './stripe-pricing';

export default async function YearlyPricingCards() {
  const { starterYearly, proYearly } = stripeEnv.pricing;
  const missingPrices = !starterYearly || !proYearly;

  const stripeData = missingPrices
    ? new Map()
    : await fetchStripeTierData({
        starterId: starterYearly ?? '',
        proId: proYearly ?? '',
      });

  return (
    <div className="bg-background container mx-auto px-6 py-8">
      {missingPrices ? <PricingMissingStripeNotice /> : null}
      <PricingGrid
        configs={YEARLY_TIER_CONFIGS}
        intervalLabel="/ year"
        stripeData={stripeData}
        subscribeLabel="Subscribe Yearly"
      />
    </div>
  );
}
