'use client';

import {
  PricingCards,
  pricingCardStyles,
  planHasAnnual,
  type BillingPeriod,
  type PricingMoney,
  type PricingPlan,
} from './PricingCards';
import { PRICING_FEATURES_BY_CLERK_SLUG } from '@/app/(marketing)/pricing/pricing-plan-features';
import { CLERK_BILLING_PLAN_SLUGS } from '@/features/billing/clerk-billing/plan-mapping';
import { ROUTES } from '@/features/navigation/routes';
import { clientLogger } from '@/lib/logging/client';
import { PricingTable, SignInButton, useAuth, useClerk } from '@clerk/nextjs';
import { CheckoutButton } from '@clerk/nextjs/experimental';
import Link from 'next/link';
import { useEffect, useState, type ComponentProps } from 'react';

type ClerkFeature = { name?: string | null };

type ClerkPlanSnapshot = {
  id: string;
  slug: string;
  name?: string | null;
  description?: string | null;
  features: ClerkFeature[];
  fee?: PricingMoney | null;
  annualFee?: PricingMoney | null;
  annualMonthlyFee?: PricingMoney | null;
};

type ClerkPricingTableProps = {
  appearance: ComponentProps<typeof PricingTable>['appearance'];
  newSubscriptionRedirectUrl: string;
};

const PLAN_NAME_BY_SLUG: Record<string, string> = {
  [CLERK_BILLING_PLAN_SLUGS.free]: 'Free',
  [CLERK_BILLING_PLAN_SLUGS.starter]: 'Starter',
  [CLERK_BILLING_PLAN_SLUGS.pro]: 'Pro',
};

const PLAN_CTA_LABEL_BY_SLUG: Record<string, string> = {
  [CLERK_BILLING_PLAN_SLUGS.free]: 'Start free',
  [CLERK_BILLING_PLAN_SLUGS.starter]: 'Choose Starter',
  [CLERK_BILLING_PLAN_SLUGS.pro]: 'Choose Pro',
};

const CHECKOUT_PLAN_PARAM = 'checkoutPlan';
const CHECKOUT_PERIOD_PARAM = 'checkoutPeriod';

function buildCheckoutSignInRedirect(
  planId: string,
  period: BillingPeriod,
): string {
  return `/pricing?${new URLSearchParams({
    [CHECKOUT_PLAN_PARAM]: planId,
    [CHECKOUT_PERIOD_PARAM]: period,
  }).toString()}`;
}

function normalizePlan(plan: ClerkPlanSnapshot): PricingPlan {
  const clerkFeatures = plan.features.flatMap((feature) =>
    feature.name?.trim() ? [feature.name.trim()] : [],
  );

  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name?.trim() || PLAN_NAME_BY_SLUG[plan.slug] || plan.slug,
    description: plan.description?.trim() || '',
    features:
      clerkFeatures.length > 0
        ? clerkFeatures
        : (PRICING_FEATURES_BY_CLERK_SLUG[plan.slug] ?? []),
    fee: plan.fee ?? null,
    annualFee: plan.annualFee ?? null,
    annualMonthlyFee: plan.annualMonthlyFee ?? null,
  };
}

export function ClerkPricingTable({
  appearance,
  newSubscriptionRedirectUrl,
}: ClerkPricingTableProps) {
  const { billing, loaded } = useClerk();
  const { isLoaded, userId } = useAuth();
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [period, setPeriod] = useState<BillingPeriod>('month');

  useEffect(() => {
    if (!loaded || !billing) return;

    let cancelled = false;
    void billing
      .getPlans()
      .then((result) => {
        if (cancelled) return;
        setPlans(result.data.map(normalizePlan));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        clientLogger.error('Failed to load Clerk billing plans', {
          context: 'pricing-plans',
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [billing, loaded]);

  useEffect(() => {
    if (!isLoaded || !userId || plans.length === 0) return;

    const url = new URL(window.location.href);
    const requestedPlanId = url.searchParams.get(CHECKOUT_PLAN_PARAM);
    const requestedPeriod = url.searchParams.get(CHECKOUT_PERIOD_PARAM);
    if (!requestedPlanId && !requestedPeriod) return;

    const requestedPlan = plans.find((plan) => plan.id === requestedPlanId);
    if (
      requestedPlan &&
      (requestedPeriod === 'month' || requestedPeriod === 'annual')
    ) {
      setPeriod(
        requestedPeriod === 'annual' && planHasAnnual(requestedPlan)
          ? 'annual'
          : 'month',
      );
    }

    url.searchParams.delete(CHECKOUT_PLAN_PARAM);
    url.searchParams.delete(CHECKOUT_PERIOD_PARAM);
    window.history.replaceState(window.history.state, '', url);
  }, [isLoaded, plans, userId]);

  return (
    <PricingCards
      onPeriodChange={setPeriod}
      period={period}
      plans={plans}
      renderAction={(plan, planPeriod) => {
        const label = PLAN_CTA_LABEL_BY_SLUG[plan.slug] || 'Choose plan';

        if (!isLoaded) {
          return (
            <button
              className={pricingCardStyles.checkoutButton}
              disabled
              type='button'
            >
              {label}
            </button>
          );
        }

        if (!plan.fee?.amount) {
          return userId ? (
            <Link
              className={pricingCardStyles.checkoutButton}
              href={ROUTES.PLANS.NEW}
            >
              {label}
            </Link>
          ) : (
            <SignInButton
              forceRedirectUrl={ROUTES.PLANS.NEW}
              mode='modal'
              signUpForceRedirectUrl={ROUTES.PLANS.NEW}
              withSignUp
            >
              <button
                className={pricingCardStyles.checkoutButton}
                type='button'
              >
                {label}
              </button>
            </SignInButton>
          );
        }

        const redirect = buildCheckoutSignInRedirect(plan.id, planPeriod);
        return userId ? (
          <CheckoutButton
            checkoutProps={{ appearance }}
            newSubscriptionRedirectUrl={newSubscriptionRedirectUrl}
            planId={plan.id}
            planPeriod={planPeriod}
          >
            <button className={pricingCardStyles.checkoutButton} type='button'>
              {label}
            </button>
          </CheckoutButton>
        ) : (
          <SignInButton
            forceRedirectUrl={redirect}
            mode='modal'
            signUpForceRedirectUrl={redirect}
            withSignUp
          >
            <button className={pricingCardStyles.checkoutButton} type='button'>
              {label}
            </button>
          </SignInButton>
        );
      }}
    />
  );
}
