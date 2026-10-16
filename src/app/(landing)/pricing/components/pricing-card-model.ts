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

export function formatPricingMoney(money: PricingMoney | null): string {
  if (!money) return '$0';
  const symbol = money.currencySymbol?.trim() || '$';
  const formatted = money.amountFormatted?.trim();
  if (formatted) {
    return `${symbol}${formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted}`;
  }
  return `${symbol}${(money.amount / 100).toFixed(money.amount % 100 === 0 ? 0 : 2)}`;
}
