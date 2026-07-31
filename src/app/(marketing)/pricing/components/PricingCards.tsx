'use client';

import { usePricingCardParallax } from './usePricingCardParallax';
import { useRef, type ReactNode } from 'react';

import styles from './PricingCards.module.css';

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

type PricingCardsProps = {
  period: BillingPeriod;
  plans: readonly PricingPlan[];
  onPeriodChange: (period: BillingPeriod) => void;
  renderAction: (plan: PricingPlan, period: BillingPeriod) => ReactNode;
};

export function formatPricingMoney(money: PricingMoney | null): string {
  if (!money) return '$0';
  const symbol = money.currencySymbol?.trim() || '$';
  const formatted = money.amountFormatted?.trim();
  if (formatted) {
    return `${symbol}${formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted}`;
  }
  return `${symbol}${(money.amount / 100).toFixed(money.amount % 100 === 0 ? 0 : 2)}`;
}

export function planHasAnnual(plan: PricingPlan): boolean {
  return (
    (plan.annualFee?.amount ?? 0) > 0 ||
    (plan.annualMonthlyFee?.amount ?? 0) > 0
  );
}

export function PricingCards({
  onPeriodChange,
  period,
  plans,
  renderAction,
}: PricingCardsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  usePricingCardParallax(rootRef);

  return (
    <div className={styles.stack}>
      <div className={styles.periodDock}>
        <div
          aria-label='Billing period'
          className={styles.periodList}
          role='group'
        >
          {(['month', 'annual'] as const).map((value) => (
            <button
              aria-pressed={period === value}
              className={styles.periodTrigger}
              data-state={period === value ? 'active' : 'inactive'}
              key={value}
              onClick={() => onPeriodChange(value)}
              type='button'
            >
              {value === 'month' ? 'Monthly' : 'Yearly'}
            </button>
          ))}
        </div>
      </div>

      <div ref={rootRef} className={styles.cards} data-plan-period={period}>
        <div className='cl-pricingTable'>
          {plans.map((plan) => {
            const useAnnual = period === 'annual' && planHasAnnual(plan);
            const fee = useAnnual
              ? (plan.annualMonthlyFee ?? plan.annualFee)
              : plan.fee;
            const feePeriod = fee?.amount
              ? useAnnual && !plan.annualMonthlyFee
                ? 'Year'
                : 'Month'
              : null;
            const titleId = `pricing-plan-${plan.slug}`;

            return (
              <article
                aria-labelledby={titleId}
                className={`cl-pricingTableCard cl-pricingTableCard__${plan.slug}`}
                key={plan.id}
              >
                {/* ponytail: under-card cursor glow; face paint lives on ::after */}
                <span aria-hidden className={styles.cardUnderGlow} />
                <header className='cl-pricingTableCardHeader'>
                  <div className='cl-pricingTableCardTitleContainer'>
                    <h2 className='cl-pricingTableCardTitle' id={titleId}>
                      {plan.name}
                    </h2>
                    <p className='cl-pricingTableCardDescription'>
                      {plan.description}
                    </p>
                  </div>
                  <div>
                    <span className='cl-pricingTableCardFee'>
                      {formatPricingMoney(fee)}
                    </span>
                    {feePeriod ? (
                      <span className='cl-pricingTableCardFeePeriod'>
                        / {feePeriod}
                      </span>
                    ) : null}
                  </div>
                </header>
                <div className='cl-pricingTableCardBody'>
                  <div className='cl-pricingTableCardFeatures'>
                    <ul className='cl-pricingTableCardFeaturesList'>
                      {plan.features.map((feature) => (
                        <li
                          className='cl-pricingTableCardFeaturesListItem'
                          key={feature}
                        >
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <footer className='cl-pricingTableCardFooter'>
                  {renderAction(plan, useAnnual ? 'annual' : 'month')}
                </footer>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { styles as pricingCardStyles };
