'use client';

import type { BillingPeriod, PricingPlan } from './pricing-card-model';

import {
  PRICING_PLAN_DESCRIPTIONS,
  PRICING_PLAN_FEATURES,
} from '../pricing-plan-features';
import { PricingCards } from './PricingCards';
import { RenewalDisclosure } from './RenewalDisclosure';
import { CLERK_BILLING_PLAN_SLUGS } from '@/features/billing/clerk-billing/plan-mapping';
import { useState } from 'react';

const LOCAL_PRICING_PLANS: readonly PricingPlan[] = [
  {
    id: 'local-starter',
    slug: CLERK_BILLING_PLAN_SLUGS.starter,
    name: 'Starter',
    description: PRICING_PLAN_DESCRIPTIONS.starter,
    features: PRICING_PLAN_FEATURES.starter,
    fee: { amount: 2500, amountFormatted: '25.00' },
    annualFee: null,
    annualMonthlyFee: null,
  },
  {
    id: 'local-pro',
    slug: CLERK_BILLING_PLAN_SLUGS.pro,
    name: 'Pro',
    description: PRICING_PLAN_DESCRIPTIONS.pro,
    features: PRICING_PLAN_FEATURES.pro,
    fee: { amount: 10000, amountFormatted: '100.00' },
    annualFee: null,
    annualMonthlyFee: null,
  },
];

export function LocalPricingPreview() {
  const [period, setPeriod] = useState<BillingPeriod>('month');

  return (
    <div className='space-y-4'>
      <p className='text-center type-body text-muted-foreground'>
        Local pricing preview — representative prices; checkout is disabled.
      </p>
      <PricingCards
        onPeriodChange={setPeriod}
        period={period}
        plans={LOCAL_PRICING_PLANS}
        renderAction={(plan, planPeriod, actionClassName) => (
          <>
            {(plan.fee?.amount ?? 0) > 0 ? (
              <RenewalDisclosure period={planPeriod} plan={plan} />
            ) : null}
            <button className={actionClassName} disabled type='button'>
              Preview only
            </button>
          </>
        )}
      />
    </div>
  );
}
