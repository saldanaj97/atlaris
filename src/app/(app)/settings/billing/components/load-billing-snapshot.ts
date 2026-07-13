import type { CheckoutBillingSignatureInput } from '@/features/billing/checkout-return';

import {
  BillingSnapshotNotFoundError,
  getBillingAccountSnapshot,
} from '@/features/billing/account-snapshot';
import { ROUTES } from '@/features/navigation/routes';
import { requestBoundary } from '@/lib/api/request-boundary';
import { logger } from '@/lib/logging/logger';
import { redirect } from 'next/navigation';
import { cache } from 'react';

export const loadBillingSnapshot = cache(async () => {
  const result = await requestBoundary.component(async ({ actor, db }) => {
    try {
      return {
        snapshot: await getBillingAccountSnapshot({
          userId: actor.id,
          dbClient: db,
        }),
      };
    } catch (error) {
      if (error instanceof BillingSnapshotNotFoundError) {
        logger.warn(
          {
            userId: actor.id,
          },
          'Billing snapshot not found for settings ledger',
        );
      } else {
        logger.error(
          {
            error,
            userId: actor.id,
          },
          'Billing snapshot failed for settings ledger',
        );
      }

      return { snapshot: null };
    }
  });

  if (!result) {
    redirect(
      `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(`${ROUTES.SETTINGS.ROOT}#billing`)}`,
    );
  }

  return result.snapshot;
});

/** Baseline billing signature fields for post-checkout sync polling. */
export async function getCheckoutBillingBaseline(): Promise<CheckoutBillingSignatureInput | null> {
  const snapshot = await loadBillingSnapshot();
  if (!snapshot) {
    return null;
  }

  return {
    tier: snapshot.tier,
    status: snapshot.subscriptionStatus,
    periodEnd: snapshot.subscriptionPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
  };
}
