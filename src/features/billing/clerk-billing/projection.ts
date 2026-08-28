import type { SubscriptionTier } from '@/shared/types/billing.types';
import type {
  BillingPaymentAttemptWebhookEvent,
  BillingSubscriptionItemWebhookEvent,
  BillingSubscriptionWebhookEvent,
  WebhookEvent,
} from '@clerk/nextjs/webhooks';

import { tierFromClerkPlan } from '@/features/billing/clerk-billing/plan-mapping';

export type LocalSubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'past_due'
  | 'trialing'
  | null;

type ClerkSubscriptionStatus =
  | 'abandoned'
  | 'active'
  | 'canceled'
  | 'ended'
  | 'expired'
  | 'incomplete'
  | 'past_due'
  | 'upcoming';

type ClerkSubscriptionItemStatus = ClerkSubscriptionStatus;

export type CurrentBillingState = {
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: LocalSubscriptionStatus;
  subscriptionPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

export type ClerkBillingProjection = CurrentBillingState;

export type ClerkBillingProjectionItem = {
  id: string;
  status: ClerkSubscriptionItemStatus;
  tier: SubscriptionTier | null;
  planId: string | null;
  planSlug: string | null;
  amountInCents: number | null;
  periodEnd: Date | null;
  canceledAt: Date | null;
  isFreeTrial: boolean;
};

export type ClerkBillingProjectionSource = {
  type: string;
  payerUserId: string | null;
  clerkBillingUpdatedAt: Date | null;
  subscriptionStatus: ClerkSubscriptionStatus | null;
  paymentAttemptStatus: 'pending' | 'paid' | 'failed' | null;
  items: ClerkBillingProjectionItem[];
};

type BackendBillingSubscriptionItem = {
  id: string;
  status: ClerkSubscriptionItemStatus;
  planId: string | null;
  plan: { id: string; slug: string } | null;
  amount?: { amount: number } | null;
  periodEnd: number | null;
  canceledAt?: number | null;
  isFreeTrial?: boolean;
};

export type BackendBillingSubscription = {
  status: ClerkSubscriptionStatus;
  payerId: string;
  updatedAt: number;
  subscriptionItems: BackendBillingSubscriptionItem[];
};

const PAID_TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
};

const TERMINAL_STATUSES = new Set<ClerkSubscriptionStatus>([
  'abandoned',
  'canceled',
  'ended',
  'expired',
]);

function millisecondsToDate(value: number | null | undefined): Date | null {
  return typeof value === 'number' ? new Date(value) : null;
}

function clerkResourceUpdatedAt(data: object): Date | null {
  return 'updated_at' in data && typeof data.updated_at === 'number'
    ? new Date(data.updated_at)
    : null;
}

function userIdFromPayer(
  payer: { user_id?: string } | undefined,
  payerId?: string,
): string | null {
  if (payer?.user_id) {
    return payer.user_id;
  }
  return payerId?.startsWith('user_') ? payerId : null;
}

function payerIdFromEventData(data: object): string | undefined {
  if (!('payer_id' in data)) {
    return undefined;
  }
  return typeof data.payer_id === 'string' ? data.payer_id : undefined;
}

function amountInCentsFromBillingAmount(
  amount: { amount?: number } | null | undefined,
): number | null {
  return typeof amount?.amount === 'number' ? amount.amount : null;
}

function isFreeTrialFromWebhookItem(
  item: BillingSubscriptionItemWebhookEvent['data'],
): boolean {
  return (item as { is_free_trial?: boolean }).is_free_trial === true;
}

function toProjectionItemFromWebhook(
  item: BillingSubscriptionItemWebhookEvent['data'],
): ClerkBillingProjectionItem {
  const planId = item.plan_id ?? item.plan?.id ?? null;
  const planSlug = item.plan?.slug ?? null;
  const amountInCents = amountInCentsFromBillingAmount(item.amount);

  return {
    id: item.id,
    status: item.status,
    tier: tierFromClerkPlan({ id: planId, slug: planSlug }),
    planId,
    planSlug,
    amountInCents,
    periodEnd: millisecondsToDate(item.period_end),
    canceledAt: millisecondsToDate(item.canceled_at),
    isFreeTrial: isFreeTrialFromWebhookItem(item),
  };
}

function toProjectionItemFromBackend(
  item: BackendBillingSubscriptionItem,
): ClerkBillingProjectionItem {
  const amountInCents = amountInCentsFromBillingAmount(item.amount);

  return {
    id: item.id,
    status: item.status,
    tier: tierFromClerkPlan({
      id: item.planId ?? item.plan?.id ?? null,
      slug: item.plan?.slug ?? null,
    }),
    planId: item.planId ?? item.plan?.id ?? null,
    planSlug: item.plan?.slug ?? null,
    amountInCents,
    periodEnd: millisecondsToDate(item.periodEnd),
    canceledAt: millisecondsToDate(item.canceledAt),
    isFreeTrial: item.isFreeTrial === true,
  };
}

function isSubscriptionEvent(
  event: WebhookEvent,
): event is BillingSubscriptionWebhookEvent {
  return event.type.startsWith('subscription.');
}

function isSubscriptionItemEvent(
  event: WebhookEvent,
): event is BillingSubscriptionItemWebhookEvent {
  return event.type.startsWith('subscriptionItem.');
}

function isPaymentAttemptEvent(
  event: WebhookEvent,
): event is BillingPaymentAttemptWebhookEvent {
  return event.type.startsWith('paymentAttempt.');
}

export function clerkBillingSourceFromWebhook(
  event: WebhookEvent,
): ClerkBillingProjectionSource | null {
  if (isSubscriptionItemEvent(event)) {
    return {
      type: event.type,
      payerUserId: userIdFromPayer(
        event.data.payer,
        payerIdFromEventData(event.data),
      ),
      clerkBillingUpdatedAt: clerkResourceUpdatedAt(event.data),
      subscriptionStatus: null,
      paymentAttemptStatus: null,
      items: [toProjectionItemFromWebhook(event.data)],
    };
  }

  if (isSubscriptionEvent(event)) {
    return {
      type: event.type,
      payerUserId: userIdFromPayer(event.data.payer, event.data.payer_id),
      clerkBillingUpdatedAt: clerkResourceUpdatedAt(event.data),
      subscriptionStatus: event.data.status,
      paymentAttemptStatus: null,
      items: event.data.items.map(toProjectionItemFromWebhook),
    };
  }

  if (isPaymentAttemptEvent(event)) {
    return {
      type: event.type,
      payerUserId: userIdFromPayer(
        event.data.payer,
        payerIdFromEventData(event.data),
      ),
      clerkBillingUpdatedAt: clerkResourceUpdatedAt(event.data),
      subscriptionStatus: null,
      paymentAttemptStatus: event.data.status,
      items: event.data.subscription_items.map(toProjectionItemFromWebhook),
    };
  }

  return null;
}

export function clerkBillingSourceFromBackendSubscription(
  subscription: BackendBillingSubscription,
): ClerkBillingProjectionSource {
  return {
    type: 'reconciliation.subscription',
    payerUserId: userIdFromPayer(undefined, subscription.payerId),
    clerkBillingUpdatedAt: millisecondsToDate(subscription.updatedAt),
    subscriptionStatus: subscription.status,
    paymentAttemptStatus: null,
    items: subscription.subscriptionItems.map(toProjectionItemFromBackend),
  };
}

function isPaidTier(
  tier: SubscriptionTier | null,
): tier is Exclude<SubscriptionTier, 'free'> {
  return tier === 'starter' || tier === 'pro';
}

function isRetainedCanceledItem(
  item: ClerkBillingProjectionItem,
  now: Date,
): boolean {
  return (
    item.status === 'canceled' &&
    item.periodEnd !== null &&
    item.periodEnd.getTime() > now.getTime()
  );
}

function isCanceledAtPeriodEnd(
  item: ClerkBillingProjectionItem,
  now: Date,
): boolean {
  return (
    item.canceledAt !== null &&
    item.periodEnd !== null &&
    item.periodEnd.getTime() > now.getTime()
  );
}

function chooseHighestTierItem(
  items: ClerkBillingProjectionItem[],
): ClerkBillingProjectionItem | null {
  return items.reduce<ClerkBillingProjectionItem | null>((best, item) => {
    if (item.tier === null) {
      return best;
    }
    if (best === null) {
      return item;
    }
    return PAID_TIER_RANK[item.tier] > PAID_TIER_RANK[best.tier ?? 'free']
      ? item
      : best;
  }, null);
}

function latestPeriodEnd(items: ClerkBillingProjectionItem[]): Date | null {
  return items.reduce<Date | null>((latest, item) => {
    if (item.periodEnd === null) {
      return latest;
    }
    if (latest === null || item.periodEnd.getTime() > latest.getTime()) {
      return item.periodEnd;
    }
    return latest;
  }, null);
}

function hasTerminalSubscription(
  source: ClerkBillingProjectionSource,
): boolean {
  return (
    source.subscriptionStatus !== null &&
    TERMINAL_STATUSES.has(source.subscriptionStatus)
  );
}

export function projectClerkBillingSource(
  source: ClerkBillingProjectionSource,
  current: CurrentBillingState,
  now = new Date(),
): ClerkBillingProjection | null {
  if (source.paymentAttemptStatus === 'pending') {
    return null;
  }

  if (source.items.some((item) => item.tier === null)) {
    return null;
  }

  const paidItems = source.items.filter((item) => isPaidTier(item.tier));

  if (source.paymentAttemptStatus === 'failed') {
    // Failed attempts can include active-looking items; never use them to promote a tier.
    if (!isPaidTier(current.subscriptionTier)) {
      return null;
    }

    return {
      subscriptionTier: current.subscriptionTier,
      subscriptionStatus: 'past_due',
      subscriptionPeriodEnd: current.subscriptionPeriodEnd,
      cancelAtPeriodEnd: current.cancelAtPeriodEnd,
    };
  }

  const activePaidItem = chooseHighestTierItem(
    paidItems.filter((item) => item.status === 'active'),
  );

  if (activePaidItem?.tier) {
    return {
      subscriptionTier: activePaidItem.tier,
      subscriptionStatus: activePaidItem.isFreeTrial ? 'trialing' : 'active',
      subscriptionPeriodEnd: activePaidItem.periodEnd,
      cancelAtPeriodEnd: isCanceledAtPeriodEnd(activePaidItem, now),
    };
  }

  const pastDuePaidItems = paidItems.filter(
    (item) => item.status === 'past_due',
  );
  if (source.subscriptionStatus === 'past_due' || pastDuePaidItems.length > 0) {
    if (!isPaidTier(current.subscriptionTier)) {
      return null;
    }

    const currentTierPastDueItems = pastDuePaidItems.filter(
      (item) => item.tier === current.subscriptionTier,
    );

    return {
      subscriptionTier: current.subscriptionTier,
      subscriptionStatus: 'past_due',
      subscriptionPeriodEnd:
        latestPeriodEnd(currentTierPastDueItems) ??
        current.subscriptionPeriodEnd,
      cancelAtPeriodEnd:
        current.cancelAtPeriodEnd ||
        currentTierPastDueItems.some((item) =>
          isCanceledAtPeriodEnd(item, now),
        ),
    };
  }

  const retainedPaidItem = chooseHighestTierItem(
    paidItems.filter((item) => isRetainedCanceledItem(item, now)),
  );

  if (retainedPaidItem?.tier) {
    return {
      subscriptionTier: retainedPaidItem.tier,
      subscriptionStatus:
        source.subscriptionStatus === 'active'
          ? retainedPaidItem.isFreeTrial
            ? 'trialing'
            : 'active'
          : 'canceled',
      subscriptionPeriodEnd: retainedPaidItem.periodEnd,
      cancelAtPeriodEnd: true,
    };
  }

  const upcomingFreeItem = source.items.find(
    (item) => item.tier === 'free' && item.status === 'upcoming',
  );
  if (upcomingFreeItem && isPaidTier(current.subscriptionTier)) {
    return {
      subscriptionTier: current.subscriptionTier,
      subscriptionStatus: 'canceled',
      subscriptionPeriodEnd:
        current.subscriptionPeriodEnd ?? upcomingFreeItem.periodEnd,
      cancelAtPeriodEnd: true,
    };
  }

  const activeFreeItem = source.items.find(
    (item) => item.tier === 'free' && item.status === 'active',
  );
  if (activeFreeItem) {
    return {
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: activeFreeItem.periodEnd,
      cancelAtPeriodEnd: false,
    };
  }

  if (
    source.items.length > 0 &&
    source.items.every((item) => item.tier === null)
  ) {
    return null;
  }

  if (
    hasTerminalSubscription(source) ||
    paidItems.some((item) => TERMINAL_STATUSES.has(item.status))
  ) {
    return {
      subscriptionTier: 'free',
      subscriptionStatus: 'canceled',
      subscriptionPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }

  return null;
}
