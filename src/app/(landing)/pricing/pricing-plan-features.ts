import type { SubscriptionTier } from '@/shared/types/billing.types';

import { isUnlimitedNumber } from '@/app/_shared/usage-formatting';
import { CLERK_BILLING_PLAN_SLUGS } from '@/features/billing/clerk-billing/plan-mapping';
import {
  MAX_SELECTABLE_PLAN_WEEKS,
  TIER_LIMITS,
} from '@/shared/constants/tier-limits';

const WEEKS_PER_MONTH = 4;

const MODELS_BY_TIER: Record<
  SubscriptionTier,
  { card: string; comparison: string }
> = {
  free: { card: 'Free models, chosen for you', comparison: 'Free models' },
  starter: {
    card: 'Choose from a curated model list',
    comparison: 'Curated list',
  },
  pro: {
    card: 'Choose from the full model catalog',
    comparison: 'Full catalog',
  },
};

const LESSONS_CARD_LINE = 'Lessons for every module';

function pluralize(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

/** The longest plan a tier can create; tiers without a cap use the selectable maximum. */
function longestPlanWeeks(tier: SubscriptionTier): number {
  return TIER_LIMITS[tier].maxWeeks ?? MAX_SELECTABLE_PLAN_WEEKS;
}

function formatPlanLength(weeks: number): string {
  return weeks < WEEKS_PER_MONTH
    ? pluralize(weeks, 'week')
    : pluralize(Math.round(weeks / WEEKS_PER_MONTH), 'month');
}

function formatActivePlans(tier: SubscriptionTier): string {
  const limit = TIER_LIMITS[tier].maxActivePlans;
  return isUnlimitedNumber(limit) ? 'Unlimited' : String(limit);
}

function buildTierFeatures(tier: SubscriptionTier): readonly string[] {
  const { maxActivePlans, monthlyRegenerations } = TIER_LIMITS[tier];
  return [
    isUnlimitedNumber(maxActivePlans)
      ? 'Unlimited active plans'
      : pluralize(maxActivePlans, 'active plan'),
    `Plans up to ${formatPlanLength(longestPlanWeeks(tier))}`,
    // A tier with no regenerations omits the line rather than advertising a zero.
    ...(monthlyRegenerations > 0
      ? [`${monthlyRegenerations} regenerations per month`]
      : []),
    MODELS_BY_TIER[tier].card,
    LESSONS_CARD_LINE,
  ];
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
  free: buildTierFeatures('free'),
  starter: buildTierFeatures('starter'),
  pro: buildTierFeatures('pro'),
};

export const PRICING_FEATURES_BY_CLERK_SLUG: Record<string, readonly string[]> =
  {
    [CLERK_BILLING_PLAN_SLUGS.free]: PRICING_PLAN_FEATURES.free,
    [CLERK_BILLING_PLAN_SLUGS.starter]: PRICING_PLAN_FEATURES.starter,
    [CLERK_BILLING_PLAN_SLUGS.pro]: PRICING_PLAN_FEATURES.pro,
  };

/** Tier for a Clerk plan slug; undefined for a plan the comparison does not know. */
export const PRICING_TIER_BY_CLERK_SLUG: Record<
  string,
  SubscriptionTier | undefined
> = {
  [CLERK_BILLING_PLAN_SLUGS.free]: 'free',
  [CLERK_BILLING_PLAN_SLUGS.starter]: 'starter',
  [CLERK_BILLING_PLAN_SLUGS.pro]: 'pro',
};

/** `true` renders as a check mark; strings render as the cell's value. */
export type PricingComparisonValue = string | true;

export type PricingComparisonRow = {
  key: string;
  label: string;
  values: Record<SubscriptionTier, PricingComparisonValue>;
};

function valuesByTier(
  read: (tier: SubscriptionTier) => PricingComparisonValue,
): Record<SubscriptionTier, PricingComparisonValue> {
  return { free: read('free'), starter: read('starter'), pro: read('pro') };
}

/** Rows for the plan comparison table, derived from the same limits as checkout enforcement. */
export const PRICING_COMPARISON_ROWS: readonly PricingComparisonRow[] = [
  {
    key: 'active-plans',
    label: 'Active plans',
    values: valuesByTier(formatActivePlans),
  },
  {
    key: 'longest-plan',
    label: 'Longest plan',
    values: valuesByTier((tier) => formatPlanLength(longestPlanWeeks(tier))),
  },
  {
    key: 'regenerations',
    label: 'Regenerations per month',
    values: valuesByTier((tier) =>
      String(TIER_LIMITS[tier].monthlyRegenerations),
    ),
  },
  {
    key: 'models',
    label: 'Models',
    values: valuesByTier((tier) => MODELS_BY_TIER[tier].comparison),
  },
  {
    key: 'lessons',
    label: 'Lessons',
    values: valuesByTier(() => true),
  },
];
