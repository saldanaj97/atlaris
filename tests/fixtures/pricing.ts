import type { StripeTierData } from '@/app/(marketing)/pricing/components/stripe-pricing';
import type { SubscriptionTier } from '@/shared/types/billing.types';

const DEFAULT_STRIPE_TIER_DATA: Record<SubscriptionTier, StripeTierData> = {
	free: { name: 'Free', amount: '$0' },
	starter: { name: 'Starter', amount: '$9' },
	pro: { name: 'Pro', amount: '$29' },
};

function createMockStripeData(
	key: SubscriptionTier,
	overrides: Partial<StripeTierData> = {},
): StripeTierData {
	return {
		...DEFAULT_STRIPE_TIER_DATA[key],
		...overrides,
	};
}

export function createStripeTierMap(
	keys: SubscriptionTier[],
): Map<SubscriptionTier, StripeTierData> {
	return new Map(
		keys.map((key): [SubscriptionTier, StripeTierData] => [
			key,
			createMockStripeData(key),
		]),
	);
}
