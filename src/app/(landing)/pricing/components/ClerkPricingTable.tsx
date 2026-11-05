'use client';

import {
  planHasAnnual,
  renewalConsentHintId,
  type BillingPeriod,
  type PricingMoney,
  type PricingPlan,
} from './pricing-card-model';
import { PricingCards } from './PricingCards';
import { RenewalConsent, RenewalConsentHint } from './RenewalDisclosure';
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
  formatPlanSwitchDate,
  type ClerkSubscriptionSnapshot,
  type HeldPaidPlan,
  type ScheduledPaidPlan,
} from '@/features/billing/clerk-billing/subscription-snapshot';
import { CREATE_PLAN_LABEL } from '@/features/navigation/create-plan-cta';
import { ROUTES } from '@/features/navigation/routes';
import { clientLogger } from '@/lib/logging/client';
import { SignInButton, SignUpButton, useAuth, useClerk } from '@clerk/nextjs';
import {
  CheckoutButton,
  SubscriptionDetailsButton,
} from '@clerk/nextjs/experimental';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import styles from './PricingCards.module.css';

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

const PLAN_CTA_LABEL_BY_SLUG: Record<string, string> = {
  [CLERK_BILLING_PLAN_SLUGS.free]: 'Start free',
  [CLERK_BILLING_PLAN_SLUGS.starter]: 'Begin with Starter',
  [CLERK_BILLING_PLAN_SLUGS.pro]: 'Begin with Pro',
};

const CHECKOUT_PLAN_PARAM = 'checkoutPlan';
const CHECKOUT_PLAN_SLUG_PARAM = 'checkoutPlanSlug';
const CHECKOUT_PERIOD_PARAM = 'checkoutPeriod';
/** Set when the visitor ticked the renewal checkbox before signing in, so the resumed checkout stays enabled. */
const CHECKOUT_CONSENT_PARAM = 'checkoutConsent';

const PLAN_RANK: Record<string, number> = {
  [CLERK_BILLING_PLAN_SLUGS.free]: 0,
  [CLERK_BILLING_PLAN_SLUGS.starter]: 1,
  [CLERK_BILLING_PLAN_SLUGS.pro]: 2,
};

function buildCheckoutSignInRedirect(
  planId: string,
  planSlug: string,
  period: BillingPeriod,
  agreed: boolean,
): string {
  const params = new URLSearchParams({
    [CHECKOUT_PLAN_PARAM]: planId,
    [CHECKOUT_PLAN_SLUG_PARAM]: planSlug,
    [CHECKOUT_PERIOD_PARAM]: period,
  });
  if (agreed) params.set(CHECKOUT_CONSENT_PARAM, '1');
  return `/pricing?${params.toString()}`;
}

function clearCheckoutParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(CHECKOUT_PLAN_PARAM);
  url.searchParams.delete(CHECKOUT_PLAN_SLUG_PARAM);
  url.searchParams.delete(CHECKOUT_PERIOD_PARAM);
  url.searchParams.delete(CHECKOUT_CONSENT_PARAM);
  window.history.replaceState(window.history.state, '', url);
}

function isPaidPlan(plan: PricingPlan, period: BillingPeriod): boolean {
  return period === 'annual'
    ? planHasAnnual(plan)
    : (plan.fee?.amount ?? 0) > 0;
}

/** False when either plan has no rank, so an unknown plan never reads as lower or higher. */
function isBelowPlan(planSlug: string, otherPlanSlug: string | null): boolean {
  if (!otherPlanSlug) return false;
  const otherRank = PLAN_RANK[otherPlanSlug];
  const planRank = PLAN_RANK[planSlug];
  return otherRank !== undefined && planRank !== undefined
    ? planRank < otherRank
    : false;
}

/** The recommended plan: the next step up, or the top plan the viewer holds. */
function featuredPlanSlug(paidPlanSlug: string | null): string {
  if (!paidPlanSlug) return CLERK_BILLING_PLAN_SLUGS.starter;
  return paidPlanSlug === CLERK_BILLING_PLAN_SLUGS.starter
    ? CLERK_BILLING_PLAN_SLUGS.pro
    : paidPlanSlug;
}

function untilPeriodEnd(heldPlan: HeldPaidPlan): string {
  return heldPlan.periodEnd
    ? formatPlanSwitchDate(heldPlan.periodEnd)
    : 'your billing period ends';
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
        const nextPlans = result.data.map(normalizePlan);
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
      renderAction={(plan, planPeriod, actionClassName) => {
        const startLabel =
          PLAN_CTA_LABEL_BY_SLUG[plan.slug] || 'Begin with this plan';
        if (appClosed) {
          return (
            <Link className={actionClassName} href={ROUTES.AUTH.SIGN_IN}>
              {startLabel}
            </Link>
          );
        }

        const actionKey = `${plan.slug}:${planPeriod}`;
        const actionRef = (button: HTMLButtonElement | null) => {
          if (button) actionButtons.current.set(actionKey, button);
          else actionButtons.current.delete(actionKey);
        };

        if (!isLoaded || (userId && subscriptionUserId !== userId)) {
          return (
            <button className={actionClassName} disabled type='button'>
              {startLabel}
            </button>
          );
        }

        const holdsThisPlan =
          Boolean(userId) && plan.slug === activePaidPlanSlug;
        // Subscribing to the held plan again is how Clerk undoes a pending change.
        const keepsHeldPlan =
          holdsThisPlan &&
          (heldPlan?.endingAtPeriodEnd ||
            (heldPlan?.canScheduleSwitch && scheduledPlan !== null));
        if (holdsThisPlan && !keepsHeldPlan) {
          return (
            <SubscriptionDetailsButton>
              <button className={actionClassName} ref={actionRef} type='button'>
                Manage subscription
              </button>
            </SubscriptionDetailsButton>
          );
        }

        const belowHeldPlan =
          Boolean(userId) && isBelowPlan(plan.slug, activePaidPlanSlug);
        if (belowHeldPlan && plan.slug === scheduledPlan?.slug) {
          return (
            <p className={styles.planNote}>
              {scheduledPlan.startsAt
                ? `Starts ${formatPlanSwitchDate(scheduledPlan.startsAt)}. You're on ${viewerPaidPlanName} until then.`
                : `Starts when your ${viewerPaidPlanName} period ends.`}
            </p>
          );
        }

        // Clerk defers a move to a lower paid plan to the end of the period. A
        // change of billing period may not defer, so it isn't offered as one.
        const switchesToPlan =
          belowHeldPlan &&
          heldPlan?.canScheduleSwitch === true &&
          isPaidPlan(plan, planPeriod) &&
          (heldPlan.planPeriod === null || heldPlan.planPeriod === planPeriod);
        if (belowHeldPlan && !switchesToPlan) {
          const otherBillingPeriod =
            heldPlan?.canScheduleSwitch === true &&
            isPaidPlan(plan, planPeriod);
          return (
            <p className={styles.planNote}>
              {otherBillingPeriod
                ? `You're on ${viewerPaidPlanName}. Choose ${heldPlan.planPeriod === 'annual' ? 'Yearly' : 'Monthly'} above to switch.`
                : `You're on ${viewerPaidPlanName}`}
            </p>
          );
        }

        if (!keepsHeldPlan && !isPaidPlan(plan, planPeriod)) {
          return userId ? (
            <Link className={actionClassName} href={ROUTES.PLANS.NEW}>
              {CREATE_PLAN_LABEL}
            </Link>
          ) : (
            <SignUpButton
              forceRedirectUrl={ROUTES.PLANS.NEW}
              mode='modal'
              signInForceRedirectUrl={ROUTES.PLANS.NEW}
            >
              <button className={actionClassName} type='button'>
                {startLabel}
              </button>
            </SignUpButton>
          );
        }

        const label = keepsHeldPlan
          ? `Keep ${plan.name}`
          : switchesToPlan
            ? `Switch to ${plan.name}`
            : userId &&
                activePaidPlanSlug &&
                isBelowPlan(activePaidPlanSlug, plan.slug)
              ? `Upgrade to ${plan.name}`
              : startLabel;
        // Keeping a plan renews it on the terms the viewer already has.
        const checkoutPeriod =
          (keepsHeldPlan ? heldPlan?.planPeriod : null) ?? planPeriod;
        const checkoutActionKey = `${plan.slug}:${checkoutPeriod}`;
        const agreed = agreedActions[checkoutActionKey] === true;
        const hintId = agreed
          ? undefined
          : renewalConsentHintId(plan, checkoutPeriod);
        const redirect = buildCheckoutSignInRedirect(
          plan.id,
          plan.slug,
          checkoutPeriod,
          agreed,
        );
        const pendingChangeNote = keepsHeldPlan
          ? scheduledPlan?.startsAt
            ? `Moves to ${planNameBySlug(scheduledPlan.slug)} on ${formatPlanSwitchDate(scheduledPlan.startsAt)}.`
            : scheduledPlan
              ? `Moves to ${planNameBySlug(scheduledPlan.slug)} when this period ends.`
              : heldPlan?.periodEnd
                ? `Access ends ${formatPlanSwitchDate(heldPlan.periodEnd)}.`
                : 'Access ends when this period ends.'
          : null;
        return (
          <>
            <RenewalConsent
              agreed={agreed}
              onAgreedChange={(next) =>
                setAgreedActions((current) => ({
                  ...current,
                  [checkoutActionKey]: next,
                }))
              }
              period={checkoutPeriod}
              plan={plan}
            />
            {switchesToPlan && heldPlan ? (
              <p className={styles.planSwitchNote}>
                You keep {viewerPaidPlanName} until {untilPeriodEnd(heldPlan)},
                then move to {plan.name}. No charge today.
              </p>
            ) : null}
            {pendingChangeNote ? (
              <p className={styles.planSwitchNote}>{pendingChangeNote}</p>
            ) : null}
            {userId ? (
              <CheckoutButton
                // Scheduling or keeping a plan changes no entitlement today, so
                // there is no webhook for Settings to wait on.
                newSubscriptionRedirectUrl={
                  switchesToPlan || keepsHeldPlan
                    ? ROUTES.SETTINGS.BILLING
                    : newSubscriptionRedirectUrl
                }
                planId={plan.id}
                planPeriod={checkoutPeriod}
              >
                <button
                  aria-describedby={hintId}
                  className={actionClassName}
                  disabled={!agreed}
                  ref={actionRef}
                  type='button'
                >
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
                <button
                  aria-describedby={hintId}
                  className={actionClassName}
                  disabled={!agreed}
                  type='button'
                >
                  {label}
                </button>
              </SignInButton>
            )}
            {agreed ? null : (
              <RenewalConsentHint period={checkoutPeriod} plan={plan} />
            )}
          </>
        );
      }}
    />
  );
}
