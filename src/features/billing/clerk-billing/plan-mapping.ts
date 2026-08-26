import type { SubscriptionTier } from '@/shared/types/billing.types';

import { clerkBillingPlanEnv } from '@/lib/config/env/auth';

export const CLERK_BILLING_PLAN_SLUGS = {
  free: 'free_user',
  starter: 'starter_plan',
  pro: 'pro_plan',
} as const satisfies Record<SubscriptionTier, string>;

const SUBSCRIPTION_TIERS = [
  'free',
  'starter',
  'pro',
] as const satisfies readonly SubscriptionTier[];

const CLERK_BILLING_TIER_BY_SLUG = {
  [CLERK_BILLING_PLAN_SLUGS.free]: 'free',
  [CLERK_BILLING_PLAN_SLUGS.starter]: 'starter',
  [CLERK_BILLING_PLAN_SLUGS.pro]: 'pro',
} as const satisfies Record<string, SubscriptionTier>;

function normalizePlanValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

export type ClerkBillingPlanIds = Partial<
  Record<SubscriptionTier, string | null | undefined>
>;

export function clerkBillingPlanIdsFromEnv(): ClerkBillingPlanIds {
  return {
    free: clerkBillingPlanEnv.planIdFree,
    starter: clerkBillingPlanEnv.planIdStarter,
    pro: clerkBillingPlanEnv.planIdPro,
  };
}

export function uniqueClerkBillingTierByPlanId(
  planIds: ClerkBillingPlanIds,
): ReadonlyMap<string, SubscriptionTier> {
  const first = new Map<string, SubscriptionTier>();
  const ambiguous = new Set<string>();

  for (const tier of SUBSCRIPTION_TIERS) {
    const id = normalizePlanValue(planIds[tier]);
    if (!id || ambiguous.has(id)) {
      continue;
    }
    const existing = first.get(id);
    if (existing === undefined) {
      first.set(id, tier);
      continue;
    }
    if (existing !== tier) {
      first.delete(id);
      ambiguous.add(id);
    }
  }

  return first;
}

export function tierFromClerkPlan(
  input: {
    id?: string | null;
    slug?: string | null;
  },
  planIds: ClerkBillingPlanIds = clerkBillingPlanIdsFromEnv(),
): SubscriptionTier | null {
  const slug = normalizePlanValue(input.slug);
  if (slug && slug in CLERK_BILLING_TIER_BY_SLUG) {
    return CLERK_BILLING_TIER_BY_SLUG[
      slug as keyof typeof CLERK_BILLING_TIER_BY_SLUG
    ];
  }

  const id = normalizePlanValue(input.id);
  if (!id) {
    return null;
  }

  return uniqueClerkBillingTierByPlanId(planIds).get(id) ?? null;
}
