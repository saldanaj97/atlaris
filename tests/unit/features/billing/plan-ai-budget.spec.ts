import {
  PLAN_AI_BUDGET,
  TRIAL_AI_BUDGET,
  trialDailyCeilingMicrousd,
  trialUserAiCeilingMicrousd,
  isNearPlanAiCeiling,
  planAiCeilingMicrousd,
  usageCostMicrousd,
} from '@/features/billing/plan-ai-budget';
import { makeCanonicalUsage } from '@tests/fixtures/canonical-usage.factory';
import { describe, expect, it } from 'vitest';

describe('plan AI budget', () => {
  it('derives the paid ceilings from the 20% AI share of the plan price', () => {
    expect(PLAN_AI_BUDGET.aiShare).toBe(0.2);
    expect(planAiCeilingMicrousd('starter')).toBe(1_250_000);
    expect(planAiCeilingMicrousd('pro')).toBe(2_500_000);
  });

  it('caps a free trial at the Starter plan ceiling, $1.50 a month and $10 a day', () => {
    expect(TRIAL_AI_BUDGET.planCeilingUsd).toBe(
      PLAN_AI_BUDGET.ceilingUsdByTier.starter,
    );
    expect(trialUserAiCeilingMicrousd()).toBe(1_500_000);
    expect(trialDailyCeilingMicrousd()).toBe(10_000_000);
  });

  it('costs a call by the provider cost, else the catalog estimate', () => {
    expect(
      usageCostMicrousd(
        makeCanonicalUsage({
          providerCostMicrousd: 1_234,
          estimatedCostCents: 9,
        }),
      ),
    ).toBe(1_234);
    expect(
      usageCostMicrousd(
        makeCanonicalUsage({
          providerCostMicrousd: null,
          estimatedCostCents: 2,
        }),
      ),
    ).toBe(20_000);
  });

  it('stops optional steps from 80% of the ceiling', () => {
    const budget = { ceilingMicrousd: 1_000_000, spentMicrousd: 799_999 };

    expect(isNearPlanAiCeiling(budget)).toBe(false);
    expect(isNearPlanAiCeiling(budget, 800_000)).toBe(true);
    expect(isNearPlanAiCeiling({ ...budget, spentMicrousd: 1_500_000 })).toBe(
      true,
    );
  });
});
