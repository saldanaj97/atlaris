import {
  BillingSnapshotNotFoundError,
  getBillingAccountSnapshot,
} from '@/features/billing/account-snapshot';
import { buildCheckoutBillingSignature } from '@/features/billing/checkout-return';
import { requestBoundary } from '@/lib/api/request-boundary';

/** Current signed-in user's pre-checkout billing state, or null for public visitors. */
export async function getOptionalCheckoutBillingSignature(): Promise<
  string | null
> {
  return requestBoundary.component(async ({ actor, db }) => {
    try {
      const snapshot = await getBillingAccountSnapshot({
        userId: actor.id,
        dbClient: db,
      });

      return buildCheckoutBillingSignature({
        tier: snapshot.tier,
        status: snapshot.subscriptionStatus,
        periodEnd: snapshot.subscriptionPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
      });
    } catch (error) {
      if (error instanceof BillingSnapshotNotFoundError) {
        return null;
      }
      throw error;
    }
  });
}
