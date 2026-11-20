import { CLERK_BILLING_PLAN_SLUGS } from '@/features/billing/clerk-billing/plan-mapping';

export type BillingPeriod = 'month' | 'annual';

export type PricingMoney = {
  amount: number;
  amountFormatted?: string | null;
  currencySymbol?: string | null;
};

export type PricingPlan = {
  id: string;
  slug: string;
  name: string;
  description: string;
  features: readonly string[];
  fee: PricingMoney | null;
  annualFee: PricingMoney | null;
  annualMonthlyFee: PricingMoney | null;
};

export function planHasAnnual(plan: PricingPlan): boolean {
  return (
    (plan.annualFee?.amount ?? 0) > 0 ||
    (plan.annualMonthlyFee?.amount ?? 0) > 0
  );
}

export function resolvePlanPeriod(
  plan: PricingPlan,
  selectedPeriod: BillingPeriod,
): BillingPeriod {
  if (selectedPeriod === 'annual' && planHasAnnual(plan)) return 'annual';
  if ((plan.fee?.amount ?? 0) > 0) return 'month';
  return planHasAnnual(plan) ? 'annual' : 'month';
}

export type PricingPlanFee = {
  fee: PricingMoney | null;
  feePeriod: 'Month' | 'Year' | null;
};

export function resolvePlanFee(
  plan: PricingPlan,
  selectedPeriod: BillingPeriod,
): PricingPlanFee {
  const useAnnual = resolvePlanPeriod(plan, selectedPeriod) === 'annual';
  const fee = useAnnual ? (plan.annualMonthlyFee ?? plan.annualFee) : plan.fee;
  if (!fee?.amount) return { fee, feePeriod: null };
  return {
    fee,
    feePeriod: useAnnual && !plan.annualMonthlyFee ? 'Year' : 'Month',
  };
}

export function formatPricingMoney(money: PricingMoney | null): string {
  if (!money) return '$0';
  const symbol = money.currencySymbol?.trim() || '$';
  const formatted = money.amountFormatted?.trim();
  if (formatted) {
    return `${symbol}${formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted}`;
  }
  return `${symbol}${(money.amount / 100).toFixed(money.amount % 100 === 0 ? 0 : 2)}`;
}

export function renewalConsentHintId(
  plan: PricingPlan,
  period: BillingPeriod,
): string {
  return `renewal-${plan.slug}-${period}-hint`;
}

const PLAN_RANK: Record<string, number> = {
  [CLERK_BILLING_PLAN_SLUGS.free]: 0,
  [CLERK_BILLING_PLAN_SLUGS.starter]: 1,
  [CLERK_BILLING_PLAN_SLUGS.pro]: 2,
};

export function isBelowPlan(
  planSlug: string,
  otherPlanSlug: string | null,
): boolean {
  if (!otherPlanSlug) return false;
  const otherRank = PLAN_RANK[otherPlanSlug];
  const planRank = PLAN_RANK[planSlug];
  return otherRank !== undefined && planRank !== undefined
    ? planRank < otherRank
    : false;
}
