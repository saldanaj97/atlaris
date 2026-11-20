'use client';

import type { ReactElement } from 'react';

import { checkoutSignInRedirect } from './checkout-resume';
import {
  planStartLabel,
  resolvePlanAction,
  type PlanActionInput,
} from './plan-action-state';
import {
  renewalConsentHintId,
  type BillingPeriod,
  type PricingPlan,
} from './pricing-card-model';
import { RenewalConsent, RenewalConsentHint } from './RenewalDisclosure';
import { CREATE_PLAN_LABEL } from '@/features/navigation/create-plan-cta';
import { ROUTES } from '@/features/navigation/routes';
import { SignInButton, SignUpButton } from '@clerk/nextjs';
import {
  CheckoutButton,
  SubscriptionDetailsButton,
} from '@clerk/nextjs/experimental';
import Link from 'next/link';

import styles from './PricingCards.module.css';

type ButtonRef = (button: HTMLButtonElement | null) => void;

type ClerkPlanActionProps = PlanActionInput & {
  actionClassName: string;
  newSubscriptionRedirectUrl: string;
  appClosed: boolean;
  viewerPending: boolean;
  agreedActions: Record<string, boolean>;
  onAgreedChange: (actionKey: string, agreed: boolean) => void;
  registerActionButton: (
    actionKey: string,
    button: HTMLButtonElement | null,
  ) => void;
};

function StartFreeAction({
  actionClassName,
  label,
  signedIn,
}: {
  actionClassName: string;
  label: string;
  signedIn: boolean;
}): ReactElement {
  if (signedIn) {
    return (
      <Link className={actionClassName} href={ROUTES.PLANS.NEW}>
        {CREATE_PLAN_LABEL}
      </Link>
    );
  }
  return (
    <SignUpButton
      forceRedirectUrl={ROUTES.PLANS.NEW}
      mode='modal'
      signInForceRedirectUrl={ROUTES.PLANS.NEW}
    >
      <button className={actionClassName} type='button'>
        {label}
      </button>
    </SignUpButton>
  );
}

function PlanCheckoutAction({
  plan,
  period,
  label,
  note,
  redirectUrl,
  actionClassName,
  actionRef,
  signedIn,
  agreed,
  onAgreedChange,
}: {
  plan: PricingPlan;
  period: BillingPeriod;
  label: string;
  note: string | null;
  redirectUrl: string;
  actionClassName: string;
  actionRef: ButtonRef;
  signedIn: boolean;
  agreed: boolean;
  onAgreedChange: (agreed: boolean) => void;
}): ReactElement {
  const hintId = agreed ? undefined : renewalConsentHintId(plan, period);
  const signInRedirect = checkoutSignInRedirect(
    plan.id,
    plan.slug,
    period,
    agreed,
  );
  return (
    <>
      <RenewalConsent
        agreed={agreed}
        onAgreedChange={onAgreedChange}
        period={period}
        plan={plan}
      />
      {note ? <p className={styles.planSwitchNote}>{note}</p> : null}
      {signedIn ? (
        <CheckoutButton
          newSubscriptionRedirectUrl={redirectUrl}
          planId={plan.id}
          planPeriod={period}
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
          forceRedirectUrl={signInRedirect}
          mode='modal'
          signUpForceRedirectUrl={signInRedirect}
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
      {agreed ? null : <RenewalConsentHint period={period} plan={plan} />}
    </>
  );
}

export function ClerkPlanAction({
  actionClassName,
  newSubscriptionRedirectUrl,
  appClosed,
  viewerPending,
  agreedActions,
  onAgreedChange,
  registerActionButton,
  ...input
}: ClerkPlanActionProps): ReactElement {
  const { plan, planPeriod, signedIn } = input;
  const startLabel = planStartLabel(plan);
  if (appClosed) {
    return (
      <Link className={actionClassName} href={ROUTES.AUTH.SIGN_IN}>
        {startLabel}
      </Link>
    );
  }
  if (viewerPending) {
    return (
      <button className={actionClassName} disabled type='button'>
        {startLabel}
      </button>
    );
  }

  const actionRef: ButtonRef = (button) => {
    registerActionButton(`${plan.slug}:${planPeriod}`, button);
  };
  const action = resolvePlanAction(input);
  switch (action.kind) {
    case 'manage':
      return (
        <SubscriptionDetailsButton>
          <button className={actionClassName} ref={actionRef} type='button'>
            Manage subscription
          </button>
        </SubscriptionDetailsButton>
      );
    case 'note':
      return <p className={styles.planNote}>{action.text}</p>;
    case 'start-free':
      return (
        <StartFreeAction
          actionClassName={actionClassName}
          label={startLabel}
          signedIn={signedIn}
        />
      );
    case 'checkout': {
      const actionKey = `${plan.slug}:${action.period}`;
      return (
        <PlanCheckoutAction
          actionClassName={actionClassName}
          actionRef={actionRef}
          agreed={agreedActions[actionKey] === true}
          label={action.label}
          note={action.note}
          onAgreedChange={(agreed) => onAgreedChange(actionKey, agreed)}
          period={action.period}
          plan={plan}
          redirectUrl={
            action.changesNothingToday
              ? ROUTES.SETTINGS.BILLING
              : newSubscriptionRedirectUrl
          }
          signedIn={signedIn}
        />
      );
    }
  }
}
