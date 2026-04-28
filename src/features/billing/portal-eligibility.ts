import type { DbUser } from '@/lib/db/queries/types/users.types';

type BillingPortalUser = Pick<
  DbUser,
  'stripeCustomerId' | 'subscriptionStatus'
>;

type BillingPortalEligibleUser = BillingPortalUser & {
  stripeCustomerId: string;
  subscriptionStatus: NonNullable<DbUser['subscriptionStatus']>;
};

/**
 * The billing portal should only be available after a user has entered Stripe's
 * subscription lifecycle, not merely after we've pre-created a customer during
 * checkout initialization.
 */
export function canOpenBillingPortalForUser(
  user: BillingPortalUser | null | undefined,
): user is BillingPortalEligibleUser {
  return Boolean(user?.stripeCustomerId && user.subscriptionStatus);
}
