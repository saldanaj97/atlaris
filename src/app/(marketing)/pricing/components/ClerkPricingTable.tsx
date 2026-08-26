'use client';

import {
  planHasAnnual,
  type BillingPeriod,
  type PricingMoney,
  type PricingPlan,
} from './pricing-card-model';
import { PricingCards } from './PricingCards';
import { PRICING_FEATURES_BY_CLERK_SLUG } from '@/app/(marketing)/pricing/pricing-plan-features';
import { RouteErrorState } from '@/components/ui/route-error-state';
import { CLERK_BILLING_PLAN_SLUGS } from '@/features/billing/clerk-billing/plan-mapping';
import { ROUTES } from '@/features/navigation/routes';
import { clientLogger } from '@/lib/logging/client';
import { SignInButton, useAuth, useClerk } from '@clerk/nextjs';
import {
  CheckoutButton,
  SubscriptionDetailsButton,
} from '@clerk/nextjs/experimental';
import Link from 'next/link';
import { useEffect, useRef, useState, type ComponentProps } from 'react';

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

type ClerkSubscriptionSnapshot = {
  subscriptionItems: Array<{
    plan: { hasBaseFee: boolean; slug: string };
    status: 'active' | 'ended' | 'upcoming' | 'past_due';
  }>;
};

type ClerkBillingAppearance = NonNullable<
  ComponentProps<typeof CheckoutButton>['checkoutProps']
>['appearance'];

type ClerkPricingTableProps = {
  appearance: ClerkBillingAppearance;
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
const CHECKOUT_PLAN_SLUG_PARAM = 'checkoutPlanSlug';
const CHECKOUT_PERIOD_PARAM = 'checkoutPeriod';

const PLAN_RANK: Record<string, number> = {
  [CLERK_BILLING_PLAN_SLUGS.free]: 0,
  [CLERK_BILLING_PLAN_SLUGS.starter]: 1,
  [CLERK_BILLING_PLAN_SLUGS.pro]: 2,
};

function buildCheckoutSignInRedirect(
  planId: string,
  planSlug: string,
  period: BillingPeriod,
): string {
  return `/pricing?${new URLSearchParams({
    [CHECKOUT_PLAN_PARAM]: planId,
    [CHECKOUT_PLAN_SLUG_PARAM]: planSlug,
    [CHECKOUT_PERIOD_PARAM]: period,
  }).toString()}`;
}

function clearCheckoutParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(CHECKOUT_PLAN_PARAM);
  url.searchParams.delete(CHECKOUT_PLAN_SLUG_PARAM);
  url.searchParams.delete(CHECKOUT_PERIOD_PARAM);
  window.history.replaceState(window.history.state, '', url);
}

function isPaidPlan(plan: PricingPlan, period: BillingPeriod): boolean {
  return period === 'annual'
    ? planHasAnnual(plan)
    : (plan.fee?.amount ?? 0) > 0;
}

function shouldManageSubscription(
  planSlug: string,
  currentPaidPlanSlug: string | null,
): boolean {
  if (!currentPaidPlanSlug) return false;
  if (planSlug === currentPaidPlanSlug) return true;
  const currentRank = PLAN_RANK[currentPaidPlanSlug];
  const planRank = PLAN_RANK[planSlug];
  return currentRank !== undefined && planRank !== undefined
    ? planRank < currentRank
    : false;
}

function currentPaidPlanSlug(
  subscription: ClerkSubscriptionSnapshot | null,
): string | null {
  return (
    subscription?.subscriptionItems.find(
      (item) =>
        item.plan.hasBaseFee &&
        (item.status === 'active' || item.status === 'past_due'),
    )?.plan.slug ?? null
  );
}

function isExportFeatureName(name: string): boolean {
  return /\bexports?\b/i.test(name);
}

function publicPlanFeatures(plan: ClerkPlanSnapshot): readonly string[] {
  const clerkFeatures = plan.features.flatMap((feature) => {
    const name = feature.name?.trim();
    if (!name || isExportFeatureName(name)) return [];
    return [name];
  });

  return clerkFeatures.length > 0
    ? clerkFeatures
    : (PRICING_FEATURES_BY_CLERK_SLUG[plan.slug] ?? []);
}

function normalizePlan(plan: ClerkPlanSnapshot): PricingPlan {
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name?.trim() || PLAN_NAME_BY_SLUG[plan.slug] || plan.slug,
    description: plan.description?.trim() || '',
    features: publicPlanFeatures(plan),
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
  const [activePaidPlanSlug, setActivePaidPlanSlug] = useState<string | null>(
    null,
  );
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [subscriptionUserId, setSubscriptionUserId] = useState<string | null>(
    null,
  );
  const [pendingCheckout, setPendingCheckout] = useState<string | null>(null);
  const actionButtons = useRef(new Map<string, HTMLButtonElement>());
  const resumedCheckout = useRef<string | null>(null);

  useEffect(() => {
    if (!loaded) return;
    if (!billing) {
      setLoadFailed(true);
      return;
    }

    let cancelled = false;

    const subscription =
      isLoaded && userId
        ? billing.getSubscription({})
        : Promise.resolve<ClerkSubscriptionSnapshot | null>(null);

    void Promise.all([
      billing.getPlans({ for: 'user', pageSize: 100 }),
      subscription,
    ])
      .then(([result, nextSubscription]) => {
        if (cancelled) return;
        setLoadFailed(false);
        setPlans(result.data.map(normalizePlan));
        setActivePaidPlanSlug(currentPaidPlanSlug(nextSubscription));
        setSubscriptionUserId(userId ?? null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadFailed(true);
        if (isLoaded && userId) clearCheckoutParams();
        clientLogger.error('Failed to load Clerk billing plans', {
          context: 'pricing-plans',
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [billing, isLoaded, loaded, reloadNonce, userId]);

  useEffect(() => {
    if (plans.length === 0) return;

    const url = new URL(window.location.href);
    const requestedPlanId = url.searchParams.get(CHECKOUT_PLAN_PARAM);
    const requestedPlanSlug = url.searchParams.get(CHECKOUT_PLAN_SLUG_PARAM);
    const requestedPeriod = url.searchParams.get(CHECKOUT_PERIOD_PARAM);
    if (!requestedPlanId && !requestedPlanSlug && !requestedPeriod) return;

    const requestedPlan = plans.find(
      (plan) =>
        plan.id === requestedPlanId &&
        (!requestedPlanSlug || plan.slug === requestedPlanSlug) &&
        (plan.fee?.amount || planHasAnnual(plan)),
    );
    const hasValidPeriod =
      requestedPeriod === 'month' || requestedPeriod === 'annual';
    if (requestedPlan && hasValidPeriod) {
      const nextPeriod =
        requestedPeriod === 'annual' && planHasAnnual(requestedPlan)
          ? 'annual'
          : requestedPlan.fee?.amount
            ? 'month'
            : 'annual';
      setPeriod(nextPeriod);
      if (isLoaded && userId && subscriptionUserId === userId) {
        setPendingCheckout(`${requestedPlan.slug}:${nextPeriod}`);
      }
    }

    // Keep params while signed out so reload/sign-in can preserve intent.
    if (!isLoaded || !userId || subscriptionUserId !== userId) return;
    if (requestedPlan && hasValidPeriod) return;

    clearCheckoutParams();
  }, [isLoaded, plans, subscriptionUserId, userId]);

  useEffect(() => {
    if (!pendingCheckout) return;
    if (resumedCheckout.current === pendingCheckout) return;
    const button = actionButtons.current.get(pendingCheckout);
    if (!button) return;

    resumedCheckout.current = pendingCheckout;
    clearCheckoutParams();
    setPendingCheckout(null);
    button.click();
  }, [pendingCheckout]);

  if (loadFailed || (loaded && !billing)) {
    return (
      <RouteErrorState
        title='Error Loading Pricing'
        message="We couldn't load subscription plans. This could be a temporary issue."
        onRetry={() => setReloadNonce((nonce) => nonce + 1)}
      />
    );
  }

  return (
    <PricingCards
      onPeriodChange={setPeriod}
      period={period}
      plans={plans}
      renderAction={(plan, planPeriod, actionClassName) => {
        const label = PLAN_CTA_LABEL_BY_SLUG[plan.slug] || 'Choose plan';
        const actionKey = `${plan.slug}:${planPeriod}`;
        const actionRef = (button: HTMLButtonElement | null) => {
          if (button) actionButtons.current.set(actionKey, button);
          else actionButtons.current.delete(actionKey);
        };

        if (!isLoaded || (userId && subscriptionUserId !== userId)) {
          return (
            <button className={actionClassName} disabled type='button'>
              {label}
            </button>
          );
        }

        if (userId && shouldManageSubscription(plan.slug, activePaidPlanSlug)) {
          return (
            <SubscriptionDetailsButton
              subscriptionDetailsProps={{ appearance }}
            >
              <button className={actionClassName} ref={actionRef} type='button'>
                {plan.slug === activePaidPlanSlug
                  ? 'Current plan'
                  : 'Manage subscription'}
              </button>
            </SubscriptionDetailsButton>
          );
        }

        if (!isPaidPlan(plan, planPeriod)) {
          return userId ? (
            <Link className={actionClassName} href={ROUTES.PLANS.NEW}>
              {label}
            </Link>
          ) : (
            <SignInButton
              forceRedirectUrl={ROUTES.PLANS.NEW}
              mode='modal'
              signUpForceRedirectUrl={ROUTES.PLANS.NEW}
              withSignUp
            >
              <button className={actionClassName} type='button'>
                {label}
              </button>
            </SignInButton>
          );
        }

        const redirect = buildCheckoutSignInRedirect(
          plan.id,
          plan.slug,
          planPeriod,
        );
        return userId ? (
          <CheckoutButton
            checkoutProps={{ appearance }}
            newSubscriptionRedirectUrl={newSubscriptionRedirectUrl}
            planId={plan.id}
            planPeriod={planPeriod}
          >
            <button className={actionClassName} ref={actionRef} type='button'>
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
            <button className={actionClassName} type='button'>
              {label}
            </button>
          </SignInButton>
        );
      }}
    />
  );
}
