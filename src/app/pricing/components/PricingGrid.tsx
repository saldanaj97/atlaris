import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PRICING_TIERS, type TierKey } from './PricingTiers';
import { PricingCard } from './PricingCard';
import { type TierConfig } from './pricing-config';
import SubscribeButton from './SubscribeButton';
import { type StripeTierData } from './stripe-pricing';

interface PricingGridProps {
  configs: TierConfig[];
  intervalLabel: string;
  stripeData: Map<TierKey, StripeTierData>;
  subscribeLabel: string;
}

export function PricingGrid({
  configs,
  intervalLabel,
  stripeData,
  subscribeLabel,
}: PricingGridProps) {
  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-3">
      {configs.map((config) => {
        const tier = PRICING_TIERS[config.key];
        const stripeInfo = stripeData.get(config.key);
        const isPaidTier = config.priceId != null;

        return (
          <PricingCard
            key={config.key}
            name={stripeInfo?.name ?? tier.name}
            price={stripeInfo?.amount ?? tier.price ?? '$—'}
            intervalLabel={intervalLabel}
            description={tier.description}
            features={[...tier.features]}
            badge={tier.badge}
            cta={
              isPaidTier ? (
                <SubscribeButton
                  priceId={config.priceId ?? ''}
                  label={subscribeLabel}
                  variant={tier.recommended ? 'default' : 'outline'}
                  className="w-full rounded-full"
                />
              ) : (
                <Button
                  asChild
                  variant="outline"
                  className="w-full rounded-full"
                >
                  <Link href="/dashboard">Continue Free</Link>
                </Button>
              )
            }
            isPopular={tier.recommended}
          />
        );
      })}
    </div>
  );
}
