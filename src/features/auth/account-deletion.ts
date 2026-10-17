import type { BackendBillingSubscription } from '@/features/billing/clerk-billing/projection';
import type { DbClient } from '@/lib/db/types';
import type { Logger } from '@/lib/logging/logger';

import {
  applyClerkUserProjectionSource,
  clerkUserDeletionProjectionSource,
} from '@/features/auth/clerk-user-projection';
import { deletePostHogPersonForDeletedUser } from '@/features/auth/posthog-person-deletion';
import { clerkBillingSourceFromBackendSubscription } from '@/features/billing/clerk-billing/projection';
import { db as serviceRoleDb } from '@supabase/service-role';

export type AccountDeletionClient = {
  billing: {
    getUserBillingSubscription(
      userId: string,
    ): Promise<BackendBillingSubscription>;
    cancelSubscriptionItem(
      subscriptionItemId: string,
      params: { endNow: boolean },
    ): Promise<unknown>;
  };
  users: {
    deleteUser(userId: string): Promise<unknown>;
  };
};

export type AccountDeletionResult =
  | { status: 'deleted' }
  | { status: 'billing_cancel_failed' };

const ENDED_ITEM_STATUSES = new Set([
  'abandoned',
  'canceled',
  'ended',
  'expired',
]);

function isClerkNotFound(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'status' in error &&
    error.status === 404
  );
}

async function renewingPaidItemIds(
  client: AccountDeletionClient,
  authUserId: string,
): Promise<string[]> {
  let subscription: BackendBillingSubscription;
  try {
    subscription = await client.billing.getUserBillingSubscription(authUserId);
  } catch (error) {
    if (isClerkNotFound(error)) return [];
    throw error;
  }

  return clerkBillingSourceFromBackendSubscription(subscription)
    .items.filter(
      (item) =>
        (item.tier === 'starter' || item.tier === 'pro') &&
        !ENDED_ITEM_STATUSES.has(item.status),
    )
    .map((item) => item.id);
}

/**
 * Deletes the signed-in account. Paid Clerk Billing items end first, because
 * deleting the Clerk user alone leaves the subscription renewing. The Clerk
 * user is deleted only after a re-fetch shows no paid item left, then the
 * local row is tombstoned and its data erased, and the PostHog person is
 * deleted. The user.deleted webhook repeats the last two steps if this
 * process stops after the Clerk delete.
 */
export async function deleteAccount({
  authUserId,
  clerkClient,
  db = serviceRoleDb,
  logger,
  now = new Date(),
}: {
  authUserId: string;
  clerkClient: AccountDeletionClient;
  db?: DbClient;
  logger: Pick<Logger, 'error' | 'info' | 'warn'>;
  now?: Date;
}): Promise<AccountDeletionResult> {
  const paidItemIds = await renewingPaidItemIds(clerkClient, authUserId);
  for (const itemId of paidItemIds) {
    await clerkClient.billing.cancelSubscriptionItem(itemId, { endNow: true });
  }

  if (paidItemIds.length > 0) {
    const remaining = await renewingPaidItemIds(clerkClient, authUserId);
    if (remaining.length > 0) {
      logger.error(
        { authUserId, remainingItemIds: remaining },
        'Paid Clerk Billing items still active after cancel; account not deleted',
      );
      return { status: 'billing_cancel_failed' };
    }
  }

  try {
    await clerkClient.users.deleteUser(authUserId);
  } catch (error) {
    if (!isClerkNotFound(error)) throw error;
  }

  await db.transaction((tx) =>
    applyClerkUserProjectionSource(
      clerkUserDeletionProjectionSource(authUserId, now, 'account_deletion'),
      { db: tx, logger },
    ),
  );
  await deletePostHogPersonForDeletedUser(authUserId, { db, logger, now });

  logger.info(
    { authUserId, canceledItemCount: paidItemIds.length },
    'Account deleted by user',
  );
  return { status: 'deleted' };
}
