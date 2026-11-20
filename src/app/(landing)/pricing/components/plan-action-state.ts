import {
  isBelowPlan,
  planHasAnnual,
  type BillingPeriod,
  type PricingPlan,
} from './pricing-card-model';
import { CLERK_BILLING_PLAN_SLUGS } from '@/features/billing/clerk-billing/plan-mapping';
import {
  formatPlanSwitchDate,
  type HeldPaidPlan,
  type ScheduledPaidPlan,
} from '@/features/billing/clerk-billing/subscription-snapshot';

export type PlanActionInput = {
  plan: PricingPlan;
  planPeriod: BillingPeriod;
  signedIn: boolean;
  heldPlan: HeldPaidPlan | null;
  scheduledPlan: ScheduledPaidPlan | null;
  viewerPaidPlanName: string | null;
  planNameBySlug: (slug: string) => string;
};

export type PlanActionState =
  | { kind: 'manage' }
  | { kind: 'note'; text: string }
  | { kind: 'start-free' }
  | {
      kind: 'checkout';
      label: string;
      period: BillingPeriod;
      note: string | null;
      changesNothingToday: boolean;
    };

const PLAN_CTA_LABEL_BY_SLUG: Record<string, string> = {
  [CLERK_BILLING_PLAN_SLUGS.free]: 'Start free',
  [CLERK_BILLING_PLAN_SLUGS.starter]: 'Begin with Starter',
  [CLERK_BILLING_PLAN_SLUGS.pro]: 'Begin with Pro',
};

export function planStartLabel(plan: PricingPlan): string {
  return PLAN_CTA_LABEL_BY_SLUG[plan.slug] || 'Begin with this plan';
}

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

function scheduledPlanNote(
  scheduledPlan: ScheduledPaidPlan,
  viewerPaidPlanName: string | null,
): string {
  return scheduledPlan.startsAt
    ? `Starts ${formatPlanSwitchDate(scheduledPlan.startsAt)}. You're on ${viewerPaidPlanName} until then.`
    : `Starts when your ${viewerPaidPlanName} period ends.`;
}

function pendingChangeNote({
  heldPlan,
  scheduledPlan,
  planNameBySlug,
}: PlanActionInput): string {
  if (scheduledPlan) {
    const planName = planNameBySlug(scheduledPlan.slug);
    return scheduledPlan.startsAt
      ? `Moves to ${planName} on ${formatPlanSwitchDate(scheduledPlan.startsAt)}.`
      : `Moves to ${planName} when this period ends.`;
  }
  return heldPlan?.periodEnd
    ? `Access ends ${formatPlanSwitchDate(heldPlan.periodEnd)}.`
    : 'Access ends when this period ends.';
}

function lowerPlanNote({
  plan,
  planPeriod,
  heldPlan,
  scheduledPlan,
  viewerPaidPlanName,
}: PlanActionInput): string | null {
  if (plan.slug === scheduledPlan?.slug) {
    return scheduledPlanNote(scheduledPlan, viewerPaidPlanName);
  }
  const canSwitchToPlan =
    heldPlan?.canScheduleSwitch === true && isPaidPlan(plan, planPeriod);
  if (!canSwitchToPlan) return `You're on ${viewerPaidPlanName}`;
  if (heldPlan.planPeriod === null || heldPlan.planPeriod === planPeriod) {
    return null;
  }
  return `You're on ${viewerPaidPlanName}. Choose ${heldPlan.planPeriod === 'annual' ? 'Yearly' : 'Monthly'} above to switch.`;
}

function keepCheckout(input: PlanActionInput): PlanActionState {
  return {
    kind: 'checkout',
    label: `Keep ${input.plan.name}`,
    period: input.heldPlan?.planPeriod ?? input.planPeriod,
    note: pendingChangeNote(input),
    changesNothingToday: true,
  };
}

function switchCheckout(
  input: PlanActionInput,
  heldPlan: HeldPaidPlan,
): PlanActionState {
  return {
    kind: 'checkout',
    label: `Switch to ${input.plan.name}`,
    period: input.planPeriod,
    note: `You keep ${input.viewerPaidPlanName} until ${untilPeriodEnd(heldPlan)}, then move to ${input.plan.name}. No charge today.`,
    changesNothingToday: true,
  };
}

function subscribeCheckout({
  plan,
  planPeriod,
  signedIn,
  heldPlan,
}: PlanActionInput): PlanActionState {
  const upgrades =
    signedIn && heldPlan !== null && isBelowPlan(heldPlan.slug, plan.slug);
  return {
    kind: 'checkout',
    label: upgrades ? `Upgrade to ${plan.name}` : planStartLabel(plan),
    period: planPeriod,
    note: null,
    changesNothingToday: false,
  };
}

export function resolvePlanAction(input: PlanActionInput): PlanActionState {
  const { plan, planPeriod, signedIn, heldPlan, scheduledPlan } = input;

  if (signedIn && heldPlan && plan.slug === heldPlan.slug) {
    const hasPendingChange =
      heldPlan.endingAtPeriodEnd ||
      (heldPlan.canScheduleSwitch && scheduledPlan !== null);
    return hasPendingChange ? keepCheckout(input) : { kind: 'manage' };
  }

  if (signedIn && heldPlan && isBelowPlan(plan.slug, heldPlan.slug)) {
    const note = lowerPlanNote(input);
    return note === null
      ? switchCheckout(input, heldPlan)
      : { kind: 'note', text: note };
  }

  return isPaidPlan(plan, planPeriod)
    ? subscribeCheckout(input)
    : { kind: 'start-free' };
}
