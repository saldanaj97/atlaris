type BillingPeriod = 'month' | 'annual';

/** The parts of Clerk's client subscription that plan switching reads. */
export type ClerkSubscriptionSnapshot = {
  subscriptionItems: ReadonlyArray<{
    plan: { hasBaseFee: boolean; name?: string; slug: string };
    // Clerk's client type omits `canceled`, but its Backend API returns it.
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
  /** Ends at period end, and re-subscribing keeps it. */
  endingAtPeriodEnd: boolean;
  /** False for past-due and trial items, where a switch may not be deferred. */
  canScheduleSwitch: boolean;
};

export type ScheduledPaidPlan = {
  slug: string;
  name: string | null;
  startsAt: Date | null;
};

/** The paid plan the viewer has access to now. */
export function findHeldPaidPlan(
  subscription: ClerkSubscriptionSnapshot | null,
  now = new Date(),
): HeldPaidPlan | null {
  const paidItems =
    subscription?.subscriptionItems.filter((item) => item.plan.hasBaseFee) ??
    [];
  // A plan replaced by an upgrade can still list as canceled in its period, so
  // a live item wins.
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

/** The paid plan Clerk will move the viewer to at period end, if any. */
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
