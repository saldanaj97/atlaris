import Link from 'next/link';
import type { JSX } from 'react';
import { PricingCard } from '@/app/(marketing)/pricing/components/PricingCard';
import { PRICING_TIERS } from '@/app/(marketing)/pricing/components/PricingTiers';
import type { TierConfig } from '@/app/(marketing)/pricing/components/pricing-config';
import SubscribeButton from '@/app/(marketing)/pricing/components/SubscribeButton';
import type { BillingCatalogTierData } from '@/features/billing/catalog-read';
import { Button } from '@/components/ui/button';
import type { SubscriptionTier } from '@/shared/types/billing.types';

interface PricingGridProps {
  configs: TierConfig[];
  intervalLabel: string;
  tierDisplayMap: Map<SubscriptionTier, BillingCatalogTierData>;
  subscribeLabel: string;
}

export function PricingGrid({
  configs,
  intervalLabel,
  tierDisplayMap,
  subscribeLabel,
}: PricingGridProps): JSX.Element {
  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-3">
      {configs.map((config) => {
        const tier = PRICING_TIERS[config.key];
        const tierDisplayRow = tierDisplayMap.get(config.key);
        const priceId =
          typeof config.priceId === 'string' && config.priceId.trim().length > 0
            ? config.priceId
            : null;

        return (
          <PricingCard
            key={config.key}
            name={tierDisplayRow?.name ?? tier.name}
            price={tierDisplayRow?.amount ?? tier.price ?? '$—'}
            intervalLabel={intervalLabel}
            description={tier.description}
            features={tier.features}
            badge={tier.badge}
            cta={
              config.key === 'free' ? (
                <Button
                  asChild
                  variant="outline"
                  className="w-full rounded-full"
                >
                  <Link href="/dashboard">Continue Free</Link>
                </Button>
              ) : priceId ? (
                <SubscribeButton
                  priceId={priceId}
                  label={subscribeLabel}
                  variant={tier.recommended ? 'default' : 'outline'}
                  className="w-full rounded-full"
                />
              ) : (
                <Button
                  variant="outline"
                  className="w-full rounded-full"
                  disabled
                >
                  Unavailable
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
