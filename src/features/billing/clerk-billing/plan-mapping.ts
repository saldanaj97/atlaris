import type { SubscriptionTier } from '@/shared/types/billing.types';

export const CLERK_BILLING_PLAN_IDS = {
  free: 'cplan_3G8pAq7nNr5wGtYQJA19VnnYNKA',
  starter: 'cplan_3G8pAq7nNr5wGtYQJA19VnnYNKA',
  pro: 'cplan_3G8pCUUMkJeYVKqZuAanPo0c1Lb',
} as const satisfies Record<SubscriptionTier, string>;

export const CLERK_BILLING_PLAN_SLUGS = {
  free: 'free_user',
  starter: 'starter_plan',
  pro: 'pro_plan',
} as const satisfies Record<SubscriptionTier, string>;

const CLERK_BILLING_TIER_BY_SLUG = {
  [CLERK_BILLING_PLAN_SLUGS.free]: 'free',
  [CLERK_BILLING_PLAN_SLUGS.starter]: 'starter',
  [CLERK_BILLING_PLAN_SLUGS.pro]: 'pro',
} as const satisfies Record<string, SubscriptionTier>;

function normalizePlanValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

export function tierFromClerkPlan(input: {
  id?: string | null;
  slug?: string | null;
  amountInCents?: number | null;
}): SubscriptionTier | null {
  const slug = normalizePlanValue(input.slug);
  if (slug && slug in CLERK_BILLING_TIER_BY_SLUG) {
    return CLERK_BILLING_TIER_BY_SLUG[
      slug as keyof typeof CLERK_BILLING_TIER_BY_SLUG
    ];
  }

  const id = normalizePlanValue(input.id);
  if (id === CLERK_BILLING_PLAN_IDS.pro) {
    return 'pro';
  }

  if (id === CLERK_BILLING_PLAN_IDS.free) {
    if (input.amountInCents === 0) {
      return 'free';
    }
    if (typeof input.amountInCents === 'number' && input.amountInCents > 0) {
      return 'starter';
    }
  }

  return null;
}
