import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

const AI_SHARE = 0.2;

export type AiBudgetTier = Exclude<SubscriptionTier, 'free'>;

export const PLAN_AI_BUDGET = {
  aiShare: AI_SHARE,
  optionalStepCutoff: 0.8,
  ceilingUsdByTier: {
    starter: (25 * AI_SHARE) / 4,
    pro: (100 * AI_SHARE) / 8,
  },
} as const satisfies {
  aiShare: number;
  optionalStepCutoff: number;
  ceilingUsdByTier: Record<AiBudgetTier, number>;
};

const MICROUSD_PER_USD = 1_000_000;
const MICROUSD_PER_CENT = 10_000;

export function planAiCeilingMicrousd(tier: AiBudgetTier): number {
  return Math.round(PLAN_AI_BUDGET.ceilingUsdByTier[tier] * MICROUSD_PER_USD);
}

export const USER_AI_BUDGET_USD_BY_TIER = {
  starter: 7.5,
  pro: 30,
} as const satisfies Record<AiBudgetTier, number>;

export function userAiCeilingMicrousd(tier: AiBudgetTier): number {
  return Math.round(USER_AI_BUDGET_USD_BY_TIER[tier] * MICROUSD_PER_USD);
}

export const TIER_AI_DAILY_BUDGET: {
  readonly ceilingUsdByTier: Readonly<Record<AiBudgetTier, number>>;
  readonly alertShares: readonly number[];
} = {
  ceilingUsdByTier: { starter: 3, pro: 5 },
  alertShares: [0.5, 0.8],
};

export function tierAiDailyCeilingMicrousd(tier: AiBudgetTier): number {
  return Math.round(
    TIER_AI_DAILY_BUDGET.ceilingUsdByTier[tier] * MICROUSD_PER_USD,
  );
}

export const TRIAL_AI_BUDGET = {
  planCeilingUsd: 1.25,
  userMonthlyUsd: 1.5,
  dailyPoolUsd: 10,
} as const;

export function trialUserAiCeilingMicrousd(): number {
  return Math.round(TRIAL_AI_BUDGET.userMonthlyUsd * MICROUSD_PER_USD);
}

export function trialDailyCeilingMicrousd(): number {
  return Math.round(TRIAL_AI_BUDGET.dailyPoolUsd * MICROUSD_PER_USD);
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

export type PlanAiBudget = {
  readonly ceilingMicrousd: number;
  readonly spentMicrousd: number;
};

export function isNearPlanAiCeiling(
  budget: PlanAiBudget,
  spentMicrousd: number = budget.spentMicrousd,
): boolean {
  return (
    spentMicrousd >= budget.ceilingMicrousd * PLAN_AI_BUDGET.optionalStepCutoff
  );
}
