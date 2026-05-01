/**
 * Canonical local billing catalog — price ids, tier mapping, cents, display strings.
 * Used when STRIPE_LOCAL_MODE is enabled (development/test only).
 */
import type { SubscriptionTier } from '@/shared/types/billing.types';

export const LOCAL_PRICE_IDS = {
  starterMonthly: 'price_local_starter_monthly',
  starterYearly: 'price_local_starter_yearly',
  proMonthly: 'price_local_pro_monthly',
  proYearly: 'price_local_pro_yearly',
} as const;

export type LocalPriceId =
  (typeof LOCAL_PRICE_IDS)[keyof typeof LOCAL_PRICE_IDS];

type PaidTier = Exclude<SubscriptionTier, 'free'>;

/** Local Stripe price snapshot + pricing-page amount string (`unitAmount` is cents). */
export interface LocalBillingCatalogEntry {
  priceId: LocalPriceId;
  tier: PaidTier;
  interval: 'monthly' | 'yearly';
  currency: 'usd';
  unitAmount: number;
  displayAmount: string;
}

const LOCAL_BILLING_CATALOG: readonly LocalBillingCatalogEntry[] = [
  {
    priceId: LOCAL_PRICE_IDS.starterMonthly,
    tier: 'starter',
    interval: 'monthly',
    currency: 'usd',
    unitAmount: 1200,
    displayAmount: '$12',
  },
  {
    priceId: LOCAL_PRICE_IDS.starterYearly,
    tier: 'starter',
    interval: 'yearly',
    currency: 'usd',
    unitAmount: 9900,
    displayAmount: '$99',
  },
  {
    priceId: LOCAL_PRICE_IDS.proMonthly,
    tier: 'pro',
    interval: 'monthly',
    currency: 'usd',
    unitAmount: 2900,
    displayAmount: '$29',
  },
  {
    priceId: LOCAL_PRICE_IDS.proYearly,
    tier: 'pro',
    interval: 'yearly',
    currency: 'usd',
    unitAmount: 24900,
    displayAmount: '$249',
  },
] as const;

const PRICE_TO_TIER: Record<LocalPriceId, PaidTier> = Object.create(null);
const LOCAL_CATALOG_BY_PRICE_ID: Record<
  LocalPriceId,
  LocalBillingCatalogEntry
> = Object.create(null);

const LOCAL_CATALOG_BY_TIER_INTERVAL: Record<
  PaidTier,
  Record<'monthly' | 'yearly', LocalBillingCatalogEntry>
> = {
  starter: Object.create(null),
  pro: Object.create(null),
};

for (const entry of LOCAL_BILLING_CATALOG) {
  PRICE_TO_TIER[entry.priceId] = entry.tier;
  LOCAL_CATALOG_BY_PRICE_ID[entry.priceId] = entry;
  LOCAL_CATALOG_BY_TIER_INTERVAL[entry.tier][entry.interval] = entry;
}

export function tierFromLocalPriceId(priceId: string): PaidTier | null {
  return PRICE_TO_TIER[priceId as LocalPriceId] ?? null;
}

export function isLocalPriceId(priceId: string): priceId is LocalPriceId {
  return priceId in PRICE_TO_TIER;
}

export function localCatalogEntryFromPriceId(
  priceId: string,
): LocalBillingCatalogEntry | null {
  if (!isLocalPriceId(priceId)) {
    return null;
  }
  return LOCAL_CATALOG_BY_PRICE_ID[priceId];
}

export function localCatalogEntryForTierInterval(
  tier: PaidTier,
  interval: 'monthly' | 'yearly',
): LocalBillingCatalogEntry {
  return LOCAL_CATALOG_BY_TIER_INTERVAL[tier][interval];
}

export function localDisplayAmountForTier(
  tier: PaidTier,
  interval: 'monthly' | 'yearly',
): string {
  return localCatalogEntryForTierInterval(tier, interval).displayAmount;
}
