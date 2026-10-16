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
