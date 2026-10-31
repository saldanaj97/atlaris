'use client';

import {
  formatPricingMoney,
  planHasAnnual,
  resolvePlanFee,
  resolvePlanPeriod,
  type BillingPeriod,
  type PricingPlan,
} from './pricing-card-model';
import { usePricingCardParallax } from './usePricingCardParallax';
import {
  PRICING_COMPARISON_ROWS,
  PRICING_TIER_BY_CLERK_SLUG,
} from '@/app/(landing)/pricing/pricing-plan-features';
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
  const comparisonPlans = plans.flatMap((plan) => {
    const tier = PRICING_TIER_BY_CLERK_SLUG[plan.slug];
    return tier ? [{ plan, tier }] : [];
  });
  usePricingCardParallax(rootRef);

  return (
    <div className={styles.stack}>
      {annualAvailable ? (
        <div className={styles.periodDock}>
          <fieldset aria-label='Billing period' className={styles.periodList}>
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
          </fieldset>
        </div>
      ) : null}

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
            const { fee, feePeriod } = resolvePlanFee(plan, period);
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

      {comparisonPlans.length > 1 ? (
        <section
          aria-labelledby='pricing-comparison-heading'
          className={styles.comparison}
          data-pricing-comparison
        >
          <h2
            className={styles.comparisonTitle}
            id='pricing-comparison-heading'
          >
            Compare plans
          </h2>
          <section
            aria-label='Plan comparison'
            className={styles.comparisonScroll}
            tabIndex={0}
          >
            <table className={styles.comparisonTable}>
              <caption className='sr-only'>Plan comparison</caption>
              <thead>
                <tr>
                  <th scope='col'>
                    <span className='sr-only'>Feature</span>
                  </th>
                  {comparisonPlans.map(({ plan }) => {
                    const { fee, feePeriod } = resolvePlanFee(plan, period);
                    return (
                      <th key={`${plan.id}-${plan.slug}`} scope='col'>
                        <span className={styles.comparisonPlanName}>
                          {plan.name}
                        </span>
                        <span className={styles.comparisonPlanPrice}>
                          {formatPricingMoney(fee)}
                          {feePeriod ? ` per ${feePeriod.toLowerCase()}` : null}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {PRICING_COMPARISON_ROWS.map((row) => (
                  <tr key={row.key}>
                    <th scope='row'>{row.label}</th>
                    {comparisonPlans.map(({ plan, tier }) => {
                      const value = row.values[tier];
                      return (
                        <td key={`${plan.id}-${row.key}`}>
                          {value === true ? (
                            <span className={styles.comparisonIncluded}>
                              <Check aria-hidden='true' />
                              <span className='sr-only'>Included</span>
                            </span>
                          ) : (
                            value
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
