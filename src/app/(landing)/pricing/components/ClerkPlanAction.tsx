'use client';

import type { ReactElement } from 'react';

import { checkoutSignInRedirect } from './checkout-resume';
import {
  isBelowPlan,
  planHasAnnual,
  renewalConsentHintId,
  type BillingPeriod,
  type PricingPlan,
} from './pricing-card-model';
import { RenewalConsent, RenewalConsentHint } from './RenewalDisclosure';
import { CLERK_BILLING_PLAN_SLUGS } from '@/features/billing/clerk-billing/plan-mapping';
import {
  formatPlanSwitchDate,
  type HeldPaidPlan,
  type ScheduledPaidPlan,
} from '@/features/billing/clerk-billing/subscription-snapshot';
import { CREATE_PLAN_LABEL } from '@/features/navigation/create-plan-cta';
import { ROUTES } from '@/features/navigation/routes';
import { SignInButton, SignUpButton } from '@clerk/nextjs';
import {
  CheckoutButton,
  SubscriptionDetailsButton,
} from '@clerk/nextjs/experimental';
import Link from 'next/link';

import styles from './PricingCards.module.css';

type ClerkPlanActionProps = {
  plan: PricingPlan;
  planPeriod: BillingPeriod;
  actionClassName: string;
  /** Where a new or upgraded subscription lands; carries the wait for its webhook. */
  newSubscriptionRedirectUrl: string;
  appClosed: boolean;
  /** Auth or the viewer's subscription hasn't loaded, so no action is safe yet. */
  viewerPending: boolean;
  signedIn: boolean;
  heldPlan: HeldPaidPlan | null;
  scheduledPlan: ScheduledPaidPlan | null;
  viewerPaidPlanName: string | null;
  planNameBySlug: (slug: string) => string;
  agreedActions: Record<string, boolean>;
  onAgreedChange: (actionKey: string, agreed: boolean) => void;
  registerActionButton: (
    actionKey: string,
    button: HTMLButtonElement | null,
  ) => void;
};

const PLAN_CTA_LABEL_BY_SLUG: Record<string, string> = {
  [CLERK_BILLING_PLAN_SLUGS.free]: 'Start free',
  [CLERK_BILLING_PLAN_SLUGS.starter]: 'Begin with Starter',
  [CLERK_BILLING_PLAN_SLUGS.pro]: 'Begin with Pro',
};

function isPaidPlan(plan: PricingPlan, period: BillingPeriod): boolean {
  return period === 'annual'
    ? planHasAnnual(plan)
    : (plan.fee?.amount ?? 0) > 0;
}

function untilPeriodEnd(heldPlan: HeldPaidPlan): string {
  return heldPlan.periodEnd
    ? formatPlanSwitchDate(heldPlan.periodEnd)
    : 'your billing period ends';
}

/** The one action a pricing card offers this viewer, or a note when it has none. */
export function ClerkPlanAction({
  plan,
  planPeriod,
  actionClassName,
  newSubscriptionRedirectUrl,
  appClosed,
  viewerPending,
  signedIn,
  heldPlan,
  scheduledPlan,
  viewerPaidPlanName,
  planNameBySlug,
  agreedActions,
  onAgreedChange,
  registerActionButton,
}: ClerkPlanActionProps): ReactElement {
  const activePaidPlanSlug = heldPlan?.slug ?? null;
  const startLabel =
    PLAN_CTA_LABEL_BY_SLUG[plan.slug] || 'Begin with this plan';
  if (appClosed) {
    return (
      <Link className={actionClassName} href={ROUTES.AUTH.SIGN_IN}>
        {startLabel}
      </Link>
    );
  }

  const actionRef = (button: HTMLButtonElement | null) => {
    registerActionButton(`${plan.slug}:${planPeriod}`, button);
  };

  if (viewerPending) {
    return (
      <button className={actionClassName} disabled type='button'>
        {startLabel}
      </button>
    );
  }

  const holdsThisPlan = signedIn && plan.slug === activePaidPlanSlug;
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

  const belowHeldPlan = signedIn && isBelowPlan(plan.slug, activePaidPlanSlug);
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
      heldPlan?.canScheduleSwitch === true && isPaidPlan(plan, planPeriod);
    return (
      <p className={styles.planNote}>
        {otherBillingPeriod
          ? `You're on ${viewerPaidPlanName}. Choose ${heldPlan.planPeriod === 'annual' ? 'Yearly' : 'Monthly'} above to switch.`
          : `You're on ${viewerPaidPlanName}`}
      </p>
    );
  }

  if (!keepsHeldPlan && !isPaidPlan(plan, planPeriod)) {
    return signedIn ? (
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
      : signedIn &&
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
  const redirect = checkoutSignInRedirect(
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
        onAgreedChange={(next) => onAgreedChange(checkoutActionKey, next)}
        period={checkoutPeriod}
        plan={plan}
      />
      {switchesToPlan && heldPlan ? (
        <p className={styles.planSwitchNote}>
          You keep {viewerPaidPlanName} until {untilPeriodEnd(heldPlan)}, then
          move to {plan.name}. No charge today.
        </p>
      ) : null}
      {pendingChangeNote ? (
        <p className={styles.planSwitchNote}>{pendingChangeNote}</p>
      ) : null}
      {signedIn ? (
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
}
