import type { SubscriptionTier } from '@/shared/types/billing.types';

import { isUnlimitedNumber } from '@/app/_shared/usage-formatting';
import { CLERK_BILLING_PLAN_SLUGS } from '@/features/billing/clerk-billing/plan-mapping';
import {
  MAX_SELECTABLE_PLAN_WEEKS,
  TIER_LIMITS,
} from '@/shared/constants/tier-limits';

function formatMarketingLimit(value: number | null | undefined): string {
  return isUnlimitedNumber(value) ? 'Unlimited' : String(value);
}

function formatMarketingSchedulingHorizon(
  value: number | null | undefined,
): string {
  return isUnlimitedNumber(value)
    ? 'Unlimited'
    : `${formatMarketingLimit(value)}-week`;
}

/**
 * Pricing feature bullets derived from live tier limits.
 * Used when Clerk Billing plans return an empty `features` array
 * (Dashboard Features not configured). Prefer Clerk features when present.
 */
export const PRICING_PLAN_FEATURES: Record<
  SubscriptionTier,
  readonly string[]
> = {
  free: [
    `${formatMarketingLimit(TIER_LIMITS.free.maxActivePlans)} active learning plans`,
    `${formatMarketingLimit(TIER_LIMITS.free.monthlyRegenerations)} plan regenerations per month`,
    `${formatMarketingSchedulingHorizon(TIER_LIMITS.free.maxWeeks)} scheduling horizon`,
  ],
  starter: [
    `${formatMarketingLimit(TIER_LIMITS.starter.maxActivePlans)} active learning plans`,
    `${formatMarketingLimit(TIER_LIMITS.starter.monthlyRegenerations)} plan regenerations per month`,
    `${formatMarketingSchedulingHorizon(TIER_LIMITS.starter.maxWeeks)} scheduling horizon`,
    'Priority queue access',
  ],
  pro: [
    `${formatMarketingLimit(TIER_LIMITS.pro.maxActivePlans)} active learning plans`,
    `${formatMarketingLimit(TIER_LIMITS.pro.monthlyRegenerations)} plan regenerations per month`,
    `${MAX_SELECTABLE_PLAN_WEEKS}-week scheduling horizon`,
    'Priority queue + analytics',
  ],
};

export const PRICING_FEATURES_BY_CLERK_SLUG: Record<string, readonly string[]> =
  {
    [CLERK_BILLING_PLAN_SLUGS.free]: PRICING_PLAN_FEATURES.free,
    [CLERK_BILLING_PLAN_SLUGS.starter]: PRICING_PLAN_FEATURES.starter,
    [CLERK_BILLING_PLAN_SLUGS.pro]: PRICING_PLAN_FEATURES.pro,
  };
