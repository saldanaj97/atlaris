'use client';

import {
  CHECKOUT_CONSENT_PARAM,
  CHECKOUT_PERIOD_PARAM,
  CHECKOUT_PLAN_PARAM,
  CHECKOUT_PLAN_SLUG_PARAM,
  clearCheckoutParams,
} from './checkout-resume';
import { ClerkPlanAction } from './ClerkPlanAction';
import {
  isBelowPlan,
  planHasAnnual,
  type BillingPeriod,
  type PricingMoney,
  type PricingPlan,
} from './pricing-card-model';
import { PricingCards } from './PricingCards';
import {
  PRICING_FEATURES_BY_CLERK_SLUG,
  PRICING_PLAN_DESCRIPTIONS,
  PRICING_TIER_BY_CLERK_SLUG,
} from '@/app/(landing)/pricing/pricing-plan-features';
import { RouteErrorState } from '@/components/ui/route-error-state';
import { CLERK_BILLING_PLAN_SLUGS } from '@/features/billing/clerk-billing/plan-mapping';
import {
  findHeldPaidPlan,
  findScheduledPaidPlan,
  type ClerkSubscriptionSnapshot,
  type HeldPaidPlan,
  type ScheduledPaidPlan,
} from '@/features/billing/clerk-billing/subscription-snapshot';
import { clientLogger } from '@/lib/logging/client';
import { useAuth, useClerk } from '@clerk/nextjs';
import { useEffect, useRef, useState } from 'react';

type ClerkPlanSnapshot = {
  id: string;
  slug: string;
  name?: string | null;
  fee?: PricingMoney | null;
  annualFee?: PricingMoney | null;
  annualMonthlyFee?: PricingMoney | null;
};

type ClerkPricingTableProps = {
  /** Where a new or upgraded subscription lands; carries the wait for its webhook. */
  newSubscriptionRedirectUrl: string;
  /** Maintenance or launch waitlist: plans stay visible but every CTA goes through the proxy instead of Clerk modals. */
  appClosed?: boolean;
};

const PLAN_NAME_BY_SLUG: Record<string, string> = {
  [CLERK_BILLING_PLAN_SLUGS.free]: 'Free',
  [CLERK_BILLING_PLAN_SLUGS.starter]: 'Starter',
  [CLERK_BILLING_PLAN_SLUGS.pro]: 'Pro',
};

/** The recommended plan: the next step up, or the top plan the viewer holds. */
function featuredPlanSlug(paidPlanSlug: string | null): string {
  if (!paidPlanSlug) return CLERK_BILLING_PLAN_SLUGS.starter;
  return paidPlanSlug === CLERK_BILLING_PLAN_SLUGS.starter
    ? CLERK_BILLING_PLAN_SLUGS.pro
    : paidPlanSlug;
}

// Card copy comes from our tier limits, not from the Clerk plan description
// and features, so it always matches the comparison table and checkout.
function publicPlanFeatures(plan: ClerkPlanSnapshot): readonly string[] {
  return PRICING_FEATURES_BY_CLERK_SLUG[plan.slug] ?? [];
}

function publicPlanDescription(plan: ClerkPlanSnapshot): string {
  const tier = PRICING_TIER_BY_CLERK_SLUG[plan.slug];
  return tier ? PRICING_PLAN_DESCRIPTIONS[tier] : '';
}

function normalizePlan(plan: ClerkPlanSnapshot): PricingPlan {
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name?.trim() || PLAN_NAME_BY_SLUG[plan.slug] || plan.slug,
    description: publicPlanDescription(plan),
    features: publicPlanFeatures(plan),
    fee: plan.fee ?? null,
    annualFee: plan.annualFee ?? null,
    annualMonthlyFee: plan.annualMonthlyFee ?? null,
  };
}

export function ClerkPricingTable({
  newSubscriptionRedirectUrl,
  appClosed = false,
}: ClerkPricingTableProps) {
  const { billing, loaded } = useClerk();
  const { isLoaded, userId } = useAuth();
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [completedFetchKey, setCompletedFetchKey] = useState<string | null>(
    null,
  );
  const [period, setPeriod] = useState<BillingPeriod>('month');
  const [heldPlan, setHeldPlan] = useState<HeldPaidPlan | null>(null);
  const [scheduledPlan, setScheduledPlan] = useState<ScheduledPaidPlan | null>(
    null,
  );
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const fetchKey = `${loaded}-${Boolean(billing)}-${isLoaded}-${userId ?? ''}-${reloadNonce}`;
  const plansLoading = completedFetchKey !== fetchKey;
  const [subscriptionUserId, setSubscriptionUserId] = useState<string | null>(
    null,
  );
  const [pendingCheckout, setPendingCheckout] = useState<string | null>(null);
  const [agreedActions, setAgreedActions] = useState<Record<string, boolean>>(
    {},
  );
  const actionButtons = useRef(new Map<string, HTMLButtonElement>());
  const resumedCheckout = useRef<string | null>(null);

  useEffect(() => {
    if (!loaded) return;
    if (!billing) {
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
        // Atlaris is paid-only: the Clerk default plan stays as the "no
        // subscription" state but is never offered as a card.
        const nextPlans = result.data
          .filter((plan) => plan.slug !== CLERK_BILLING_PLAN_SLUGS.free)
          .map(normalizePlan);
        setCompletedFetchKey(fetchKey);
        setLoadFailed(false);
        setPlans(nextPlans);
        const nextHeldPlan = findHeldPaidPlan(nextSubscription);
        setHeldPlan(nextHeldPlan);
        setScheduledPlan(findScheduledPaidPlan(nextSubscription));
        setSubscriptionUserId(userId ?? null);

        const url = new URL(window.location.href);
        const requestedPlanId = url.searchParams.get(CHECKOUT_PLAN_PARAM);
        const requestedPlanSlug = url.searchParams.get(
          CHECKOUT_PLAN_SLUG_PARAM,
        );
        const requestedPeriod = url.searchParams.get(CHECKOUT_PERIOD_PARAM);
        const requestedConsent =
          url.searchParams.get(CHECKOUT_CONSENT_PARAM) === '1';
        if (!requestedPlanId && !requestedPlanSlug && !requestedPeriod) return;

        const requestedPlan = nextPlans.find(
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
          if (isLoaded && userId) {
            // A signed-out click meant a new subscription. Moving to a lower plan
            // is a scheduled switch, so it starts from that plan's own card.
            if (isBelowPlan(requestedPlan.slug, nextHeldPlan?.slug ?? null)) {
              clearCheckoutParams();
              return;
            }
            const resumedKey = `${requestedPlan.slug}:${nextPeriod}`;
            // Consent only carries over when the visitor ticked it before signing in.
            if (requestedConsent) {
              setAgreedActions((current) => ({
                ...current,
                [resumedKey]: true,
              }));
            }
            setPendingCheckout(resumedKey);
          }
          return;
        }

        // Keep params while signed out so reload/sign-in can preserve intent.
        if (isLoaded && userId) clearCheckoutParams();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setCompletedFetchKey(fetchKey);
        setLoadFailed(true);
        if (isLoaded && userId) clearCheckoutParams();
        clientLogger.error('Failed to load Clerk billing plans', {
          attempt: reloadNonce + 1,
          context: 'pricing-plans',
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps, react/exhaustive-effect-dependencies -- fetchKey encodes billing, auth, and reload triggers.
  }, [fetchKey]);

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

  // Waitlist and maintenance viewers see the signed-out cards; every action
  // there goes through sign-in, whatever plan the account holds.
  const viewerPlansKnown =
    !appClosed && isLoaded && Boolean(userId) && subscriptionUserId === userId;
  const activePaidPlanSlug = heldPlan?.slug ?? null;
  const viewerPaidPlanSlug = viewerPlansKnown ? activePaidPlanSlug : null;
  const planNameBySlug = (slug: string): string =>
    plans.find((plan) => plan.slug === slug)?.name ??
    PLAN_NAME_BY_SLUG[slug] ??
    slug;
  const viewerPaidPlanName = viewerPaidPlanSlug
    ? planNameBySlug(viewerPaidPlanSlug)
    : null;

  return (
    <PricingCards
      currentPlanSlug={
        viewerPlansKnown
          ? (activePaidPlanSlug ?? CLERK_BILLING_PLAN_SLUGS.free)
          : null
      }
      featuredPlanSlug={featuredPlanSlug(viewerPaidPlanSlug)}
      loading={plansLoading}
      onPeriodChange={setPeriod}
      period={period}
      plans={plans}
      renderAction={(plan, planPeriod, actionClassName) => (
        <ClerkPlanAction
          actionClassName={actionClassName}
          agreedActions={agreedActions}
          appClosed={appClosed}
          heldPlan={heldPlan}
          newSubscriptionRedirectUrl={newSubscriptionRedirectUrl}
          onAgreedChange={(actionKey, agreed) =>
            setAgreedActions((current) => ({
              ...current,
              [actionKey]: agreed,
            }))
          }
          plan={plan}
          planNameBySlug={planNameBySlug}
          planPeriod={planPeriod}
          registerActionButton={(actionKey, button) => {
            if (button) actionButtons.current.set(actionKey, button);
            else actionButtons.current.delete(actionKey);
          }}
          scheduledPlan={scheduledPlan}
          signedIn={Boolean(userId)}
          viewerPaidPlanName={viewerPaidPlanName}
          viewerPending={
            !isLoaded || (Boolean(userId) && subscriptionUserId !== userId)
          }
        />
      )}
    />
  );
}
