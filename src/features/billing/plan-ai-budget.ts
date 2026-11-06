import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

const AI_SHARE = 0.2;

/**
 * AI spend ceiling per fully generated plan (JCS-170). Interim: AI spend at
 * 20% of revenue, Starter $25/month over 4 plan-equivalents and Pro
 * $100/month over 8; Free is an acquisition cost. The JCS-163 eval scores
 * cost against the same ceilings.
 */
export const PLAN_AI_BUDGET = {
  aiShare: AI_SHARE,
  /** Optional steps (the advisor, a second repair pass) stop at this share of the ceiling. */
  optionalStepCutoff: 0.8,
  ceilingUsdByTier: {
    free: 0.05,
    starter: (25 * AI_SHARE) / 4,
    pro: (100 * AI_SHARE) / 8,
  },
} as const satisfies {
  aiShare: number;
  optionalStepCutoff: number;
  ceilingUsdByTier: Record<SubscriptionTier, number>;
};

const MICROUSD_PER_USD = 1_000_000;
const MICROUSD_PER_CENT = 10_000;

export function planAiCeilingMicrousd(tier: SubscriptionTier): number {
  return Math.round(PLAN_AI_BUDGET.ceilingUsdByTier[tier] * MICROUSD_PER_USD);
}

/**
 * AI spend ceiling per user per calendar month (UTC), across all of the
 * user's plans, including deleted ones (DEV-208). New AI work is refused once
 * a user reaches it; a run already admitted is still bounded by the per-plan
 * ceiling. Values approved 2026-11-05.
 */
export const USER_AI_BUDGET_USD_BY_TIER = {
  free: 0.25,
  starter: 7.5,
  pro: 30,
} as const satisfies Record<SubscriptionTier, number>;

export function userAiCeilingMicrousd(tier: SubscriptionTier): number {
  return Math.round(USER_AI_BUDGET_USD_BY_TIER[tier] * MICROUSD_PER_USD);
}

/**
 * Second layer behind the per-user ceiling (DEV-208): each tier's total AI
 * spend per UTC day, so a surge on one tier (say, free sign-ups on launch day)
 * cannot pause the others. New AI work pauses for that tier at its ceiling,
 * and Sentry gets a new issue each day a tier's spend first passes each alert
 * share. Keep each ceiling under that tier's OpenRouter key limit, so the app
 * stops cleanly before the provider starts failing calls.
 */
export const TIER_AI_DAILY_BUDGET: {
  readonly ceilingUsdByTier: Readonly<Record<SubscriptionTier, number>>;
  readonly alertShares: readonly number[];
} = {
  ceilingUsdByTier: { free: 2, starter: 3, pro: 5 },
  alertShares: [0.5, 0.8],
};

export function tierAiDailyCeilingMicrousd(tier: SubscriptionTier): number {
  return Math.round(
    TIER_AI_DAILY_BUDGET.ceilingUsdByTier[tier] * MICROUSD_PER_USD,
  );
}

/**
 * One call's cost in micro-USD: the provider-reported cost, else the catalog
 * estimate. Matches how `sumPlanAiSpendMicrousd` reads `ai_usage_events`.
 */
export function usageCostMicrousd(usage: CanonicalAIUsage): number {
  return (
    usage.providerCostMicrousd ?? usage.estimatedCostCents * MICROUSD_PER_CENT
  );
}

/** Spend and ceiling for one generation of a plan, snapshotted when lessons are claimed. */
export type PlanAiBudget = {
  readonly ceilingMicrousd: number;
  readonly spentMicrousd: number;
};

/** True once `spentMicrousd` reaches the optional-step cutoff of the ceiling. */
export function isNearPlanAiCeiling(
  budget: PlanAiBudget,
  spentMicrousd: number = budget.spentMicrousd,
): boolean {
  return (
    spentMicrousd >= budget.ceilingMicrousd * PLAN_AI_BUDGET.optionalStepCutoff
  );
}
