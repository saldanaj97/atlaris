export const AUTO_RENEWAL_NOTICE =
  'Renews automatically at the end of each billing period until you cancel. Cancellation takes effect at the end of the current billing period.';

const MANAGEABLE_STATUSES = new Set(['active', 'trialing', 'past_due']);

/**
 * A subscription can be managed or canceled in Clerk only while it is a live
 * paid subscription; free and already-ended accounts have nothing to cancel.
 */
export function hasManageableSubscription(snapshot: {
  tier: string;
  subscriptionStatus: string | null;
}): boolean {
  return (
    snapshot.tier !== 'free' &&
    snapshot.subscriptionStatus !== null &&
    MANAGEABLE_STATUSES.has(snapshot.subscriptionStatus)
  );
}

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  trialing: 'Trial',
  past_due: 'Past due',
  canceled: 'Canceled',
};

/** Human label for a stored subscription status; unknown values read as-is, sentence-cased. */
export function formatSubscriptionStatus(status: string | null): string {
  if (!status) return '—';

  const label = SUBSCRIPTION_STATUS_LABELS[status];
  if (label) return label;

  const words = status.replaceAll('_', ' ').trim().toLowerCase();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}
