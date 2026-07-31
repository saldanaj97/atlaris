'use client';

import type { BillingPeriod, PricingPlan } from './pricing-card-model';

import { PRICING_PLAN_FEATURES } from '../pricing-plan-features';
import { PricingCards } from './PricingCards';
import { CLERK_BILLING_PLAN_SLUGS } from '@/features/billing/clerk-billing/plan-mapping';
import { useState } from 'react';

const LOCAL_PRICING_PLANS: readonly PricingPlan[] = [
  {
    id: 'local-free',
    slug: CLERK_BILLING_PLAN_SLUGS.free,
    name: 'Free',
    description: 'For finding your rhythm.',
    features: PRICING_PLAN_FEATURES.free,
    fee: null,
    annualFee: null,
    annualMonthlyFee: null,
  },
  {
    id: 'local-starter',
    slug: CLERK_BILLING_PLAN_SLUGS.starter,
    name: 'Starter',
    description: 'For building a steady practice.',
    features: PRICING_PLAN_FEATURES.starter,
    fee: { amount: 1000 },
    annualFee: { amount: 9600 },
    annualMonthlyFee: { amount: 800 },
  },
  {
    id: 'local-pro',
    slug: CLERK_BILLING_PLAN_SLUGS.pro,
    name: 'Pro',
    description: 'For deeper, longer-running work.',
    features: PRICING_PLAN_FEATURES.pro,
    fee: { amount: 2000 },
    annualFee: { amount: 19200 },
    annualMonthlyFee: { amount: 1600 },
  },
];

export function LocalPricingPreview() {
  const [period, setPeriod] = useState<BillingPeriod>('month');

  return (
    <div className='space-y-4'>
      <p className='text-center text-sm text-muted-foreground'>
        Local pricing preview — representative prices; checkout is disabled.
      </p>
      <PricingCards
        onPeriodChange={setPeriod}
        period={period}
        plans={LOCAL_PRICING_PLANS}
        renderAction={(_plan, _period, actionClassName) => (
          <button className={actionClassName} disabled type='button'>
            Preview only
          </button>
        )}
      />
    </div>
  );
}
