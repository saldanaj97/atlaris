/**
 * Local-only synthetic subscription replay. Implementation lives in
 * `reconciliation.ts` (`replaySyntheticSubscriptionCreated`) so local + webhook
 * share one write-side owner.
 */
export { replaySyntheticSubscriptionCreated as replayLocalSubscriptionCreated } from '@/features/billing/stripe-commerce/reconciliation';
