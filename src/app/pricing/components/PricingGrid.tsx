import Link from 'next/link';
import type { JSX } from 'react';
import { PricingCard } from '@/app/pricing/components/PricingCard';
import { PRICING_TIERS } from '@/app/pricing/components/PricingTiers';
import type { TierConfig } from '@/app/pricing/components/pricing-config';
import SubscribeButton from '@/app/pricing/components/SubscribeButton';
import type { StripeTierData } from '@/app/pricing/components/stripe-pricing';
import { Button } from '@/components/ui/button';
import type { SubscriptionTier } from '@/shared/types/billing.types';

interface PricingGridProps {
	configs: TierConfig[];
	intervalLabel: string;
	stripeData: Map<SubscriptionTier, StripeTierData>;
	subscribeLabel: string;
}

export function PricingGrid({
	configs,
	intervalLabel,
	stripeData,
	subscribeLabel,
}: PricingGridProps): JSX.Element {
	return (
		<div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-3">
			{configs.map((config) => {
				const tier = PRICING_TIERS[config.key];
				const stripeInfo = stripeData.get(config.key);
				const priceId =
					typeof config.priceId === 'string' && config.priceId.trim().length > 0
						? config.priceId
						: null;

				return (
					<PricingCard
						key={config.key}
						name={stripeInfo?.name ?? tier.name}
						price={stripeInfo?.amount ?? tier.price ?? '$—'}
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
