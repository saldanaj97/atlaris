/**
 * Canonical local billing catalog — price ids, tier mapping, and display strings.
 * Used when STRIPE_LOCAL_MODE is enabled (development/test only).
 */
import type { SubscriptionTier } from '@/shared/types/billing.types';

export const LOCAL_PRICE_IDS = {
	starterMonthly: 'price_local_starter_monthly',
	starterYearly: 'price_local_starter_yearly',
	proMonthly: 'price_local_pro_monthly',
	proYearly: 'price_local_pro_yearly',
} as const;

type LocalPriceId = (typeof LOCAL_PRICE_IDS)[keyof typeof LOCAL_PRICE_IDS];

const PRICE_TO_TIER: Record<LocalPriceId, 'starter' | 'pro'> = {
	[LOCAL_PRICE_IDS.starterMonthly]: 'starter',
	[LOCAL_PRICE_IDS.starterYearly]: 'starter',
	[LOCAL_PRICE_IDS.proMonthly]: 'pro',
	[LOCAL_PRICE_IDS.proYearly]: 'pro',
};

export function tierFromLocalPriceId(
	priceId: string,
): 'starter' | 'pro' | null {
	return PRICE_TO_TIER[priceId as LocalPriceId] ?? null;
}

export function isLocalPriceId(priceId: string): priceId is LocalPriceId {
	return priceId in PRICE_TO_TIER;
}

/** Display amounts for pricing UI when not calling live Stripe. */
const LOCAL_STRIPE_DISPLAY_AMOUNTS: Record<
	'starter' | 'pro',
	{ monthly: string; yearly: string }
> = {
	starter: { monthly: '$12', yearly: '$99' },
	pro: { monthly: '$29', yearly: '$249' },
};

export function localDisplayAmountForTier(
	tier: Exclude<SubscriptionTier, 'free'>,
	interval: 'monthly' | 'yearly',
): string {
	return LOCAL_STRIPE_DISPLAY_AMOUNTS[tier][interval];
}
