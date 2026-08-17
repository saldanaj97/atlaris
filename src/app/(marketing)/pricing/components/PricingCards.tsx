'use client';

import {
  planHasAnnual,
  resolvePlanPeriod,
  type BillingPeriod,
  type PricingMoney,
  type PricingPlan,
} from './pricing-card-model';
import { usePricingCardParallax } from './usePricingCardParallax';
import { CLERK_BILLING_PLAN_SLUGS } from '@/features/billing/clerk-billing/plan-mapping';
import { useRef, type ReactNode } from 'react';

import styles from './PricingCards.module.css';

type PricingCardsProps = {
  period: BillingPeriod;
  plans: readonly PricingPlan[];
  onPeriodChange: (period: BillingPeriod) => void;
  renderAction: (
    plan: PricingPlan,
    period: BillingPeriod,
    actionClassName: string,
  ) => ReactNode;
};

function formatPricingMoney(money: PricingMoney | null): string {
  if (!money) return '$0';
  const symbol = money.currencySymbol?.trim() || '$';
  const formatted = money.amountFormatted?.trim();
  if (formatted) {
    return `${symbol}${formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted}`;
  }
  return `${symbol}${(money.amount / 100).toFixed(money.amount % 100 === 0 ? 0 : 2)}`;
}

export function PricingCards({
  onPeriodChange,
  period,
  plans,
  renderAction,
}: PricingCardsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const annualAvailable = plans.some(planHasAnnual);
  usePricingCardParallax(rootRef);

  return (
    <div className={styles.stack}>
      <div className={styles.periodDock}>
        <fieldset aria-label='Billing period' className={styles.periodList}>
          {(['month', 'annual'] as const).map((value) => (
            <button
              aria-pressed={period === value}
              className={styles.periodTrigger}
              data-state={period === value ? 'active' : 'inactive'}
              disabled={value === 'annual' && !annualAvailable}
              key={value}
              onClick={() => onPeriodChange(value)}
              type='button'
            >
              {value === 'month'
                ? 'Monthly'
                : annualAvailable
                  ? 'Yearly'
                  : 'Yearly · Soon'}
            </button>
          ))}
        </fieldset>
      </div>

      <div ref={rootRef} className={styles.cards}>
        <div className={styles.table}>
          {plans.map((plan) => {
            const planPeriod = resolvePlanPeriod(plan, period);
            const useAnnual = planPeriod === 'annual';
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
                className={styles.card}
                data-featured={
                  plan.slug === CLERK_BILLING_PLAN_SLUGS.starter
                    ? 'true'
                    : undefined
                }
                data-pricing-card
                key={`${plan.id}-${plan.slug}`}
              >
                {/* ponytail: under-card cursor glow; face paint lives on ::after */}
                <span aria-hidden className={styles.cardUnderGlow} />
                <header className={styles.cardHeader}>
                  <div className={styles.cardTitleContainer}>
                    <h2 className={styles.cardTitle} id={titleId}>
                      {plan.name}
                    </h2>
                    <p className={styles.cardDescription}>{plan.description}</p>
                  </div>
                  <div>
                    <span className={styles.cardFee}>
                      {formatPricingMoney(fee)}
                    </span>
                    {feePeriod ? (
                      <span className={styles.cardFeePeriod}>
                        / {feePeriod}
                      </span>
                    ) : null}
                  </div>
                </header>
                <div className={styles.cardBody}>
                  <ul className={styles.cardFeaturesList}>
                    {plan.features.map((feature, index) => (
                      <li
                        className={styles.cardFeaturesListItem}
                        key={`${feature}-${index}`}
                      >
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                <footer className={styles.cardFooter}>
                  {renderAction(plan, planPeriod, styles.checkoutButton)}
                </footer>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
