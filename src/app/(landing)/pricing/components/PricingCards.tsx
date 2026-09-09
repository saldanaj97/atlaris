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
import { Check } from 'lucide-react';
import { useRef, type ReactNode } from 'react';

import styles from './PricingCards.module.css';

type PricingCardsProps = {
  loading?: boolean;
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

function getComparisonRows(plans: readonly PricingPlan[]) {
  const seen = new Set<string>();
  const rows: Array<{ key: string; label: string }> = [];

  for (const plan of plans) {
    for (const feature of plan.features) {
      const label = feature.trim();
      const key = label.toLocaleLowerCase();
      if (!label || seen.has(key)) continue;
      seen.add(key);
      rows.push({ key, label });
    }
  }

  return rows;
}

function planListsFeature(plan: PricingPlan, featureKey: string): boolean {
  return plan.features.some(
    (feature) => feature.trim().toLocaleLowerCase() === featureKey,
  );
}

/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- the named overflow region is intentionally tabbable so keyboard users can scroll the comparison table. */
export function PricingCards({
  loading = false,
  onPeriodChange,
  period,
  plans,
  renderAction,
}: PricingCardsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const annualAvailable = plans.some(planHasAnnual);
  const comparisonRows = plans.length > 1 ? getComparisonRows(plans) : [];
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
        <div aria-busy={loading} className={styles.table}>
          {loading ? (
            <output aria-live='polite' className='sr-only'>
              Loading plans
            </output>
          ) : null}
          {loading && plans.length === 0
            ? [0, 1, 2].map((index) => (
                <div
                  aria-hidden='true'
                  className={`${styles.card} ${styles.cardPlaceholder}`}
                  key={index}
                />
              ))
            : null}
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

      {comparisonRows.length > 0 ? (
        <section
          aria-labelledby='pricing-comparison-heading'
          className={styles.comparison}
          data-pricing-comparison
        >
          <header className={styles.comparisonHeader}>
            <p className={styles.comparisonOverline}>Compare plans</p>
            <h2
              className={styles.comparisonTitle}
              id='pricing-comparison-heading'
            >
              See what each plan lists.
            </h2>
            <p className={styles.comparisonDescription}>
              Feature details come from the current plan catalog.
            </p>
          </header>
          <section
            aria-label='Plan feature comparison'
            className={styles.comparisonScroll}
            tabIndex={0}
          >
            <table className={styles.comparisonTable}>
              <caption className='sr-only'>Plan feature comparison</caption>
              <thead>
                <tr>
                  <th scope='col'>Feature</th>
                  {plans.map((plan) => (
                    <th key={`${plan.id}-${plan.slug}`} scope='col'>
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((feature) => (
                  <tr key={feature.key}>
                    <th scope='row'>{feature.label}</th>
                    {plans.map((plan) => {
                      const listed = planListsFeature(plan, feature.key);
                      return (
                        <td key={`${plan.id}-${feature.key}`}>
                          {listed ? (
                            <span className={styles.comparisonIncluded}>
                              <Check aria-hidden='true' />
                              <span className='sr-only'>Feature listed</span>
                            </span>
                          ) : (
                            <span className={styles.comparisonMissing}>
                              <span aria-hidden='true'>—</span>
                              <span className='sr-only'>
                                Feature not listed
                              </span>
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </section>
      ) : null}
    </div>
  );
}

/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */
