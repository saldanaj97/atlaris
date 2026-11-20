type BillingPeriod = 'month' | 'annual';

export type ClerkSubscriptionSnapshot = {
  subscriptionItems: ReadonlyArray<{
    plan: { hasBaseFee: boolean; name?: string; slug: string };
    status: 'active' | 'canceled' | 'ended' | 'upcoming' | 'past_due';
    planPeriod?: BillingPeriod;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    canceledAt?: Date | null;
    isFreeTrial?: boolean;
  }>;
};

export type HeldPaidPlan = {
  slug: string;
  planPeriod: BillingPeriod | null;
  periodEnd: Date | null;
  endingAtPeriodEnd: boolean;
  canScheduleSwitch: boolean;
};

export type ScheduledPaidPlan = {
  slug: string;
  name: string | null;
  startsAt: Date | null;
};

export function findHeldPaidPlan(
  subscription: ClerkSubscriptionSnapshot | null,
  now = new Date(),
): HeldPaidPlan | null {
  const paidItems =
    subscription?.subscriptionItems.filter((item) => item.plan.hasBaseFee) ??
    [];
  const item =
    paidItems.find(
      (candidate) =>
        candidate.status === 'active' || candidate.status === 'past_due',
    ) ??
    paidItems.find(
      (candidate) =>
        candidate.status === 'canceled' &&
        candidate.periodEnd != null &&
        candidate.periodEnd.getTime() > now.getTime(),
    );
  if (!item) return null;

  const canScheduleSwitch =
    item.status !== 'past_due' && item.isFreeTrial !== true;

  return {
    slug: item.plan.slug,
    planPeriod: item.planPeriod ?? null,
    periodEnd: item.periodEnd ?? null,
    endingAtPeriodEnd:
      canScheduleSwitch &&
      (item.status === 'canceled' || item.canceledAt != null),
    canScheduleSwitch,
  };
}

export function findScheduledPaidPlan(
  subscription: ClerkSubscriptionSnapshot | null,
): ScheduledPaidPlan | null {
  const item = subscription?.subscriptionItems.find(
    (candidate) => candidate.plan.hasBaseFee && candidate.status === 'upcoming',
  );
  if (!item) return null;

  return {
    slug: item.plan.slug,
    name: item.plan.name ?? null,
    startsAt: item.periodStart ?? null,
  };
}

/**
 * Plan-switch dates only render after a client fetch, so they use the viewer's
 * time zone without a hydration mismatch.
 */
export function formatPlanSwitchDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
