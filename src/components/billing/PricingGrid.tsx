import { Button } from '../ui/button';
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
    <div className="grid gap-6 md:grid-cols-3">
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
            features={[...tier.features]}
            badge={{
              label: tier.badge,
              variant: config.badgeVariant ?? tier.variant,
            }}
            cta={
              isPaidTier ? (
                <SubscribeButton
                  priceId={config.priceId ?? ''}
                  label={subscribeLabel}
                  className="w-full"
                />
              ) : (
                <Button asChild variant={tier.variant} className="w-full">
                  {tier.button}
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
