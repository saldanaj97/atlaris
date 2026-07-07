import type { Logger } from '@/lib/logging/logger';
import type { WebhookEvent } from '@clerk/nextjs/webhooks';

import {
  clerkBillingSourceFromBackendSubscription,
  clerkBillingSourceFromWebhook,
  projectClerkBillingSource,
  type BackendBillingSubscription,
  type ClerkBillingProjectionSource,
} from '@/features/billing/clerk-billing/projection';
import { clerkClient as getClerkClient } from '@clerk/nextjs/server';
import { clerkWebhookEvents, users } from '@supabase/schema';
import { db as serviceRoleDb } from '@supabase/service-role';
import { asc, eq, gt } from 'drizzle-orm';

type ServiceRoleDb = typeof serviceRoleDb;

type ReconciliationDeps = {
  db?: ServiceRoleDb;
  clerkClient?: ClerkBillingClient;
  logger: Logger;
};

type ClerkBillingClient = {
  billing: {
    getUserBillingSubscription(
      userId: string,
    ): Promise<BackendBillingSubscription>;
  };
};

const DEFAULT_RECONCILIATION_LIMIT = 100;
const MAX_RECONCILIATION_LIMIT = 100;

export type ClerkBillingApplyResult = 'updated' | 'skipped' | 'ignored';

export type ApplyVerifiedClerkBillingEventResult =
  | { status: 'duplicate' }
  | { status: 'inserted'; result: ClerkBillingApplyResult };

async function refreshClerkBillingSource(
  source: ClerkBillingProjectionSource,
  deps: ReconciliationDeps,
): Promise<ClerkBillingProjectionSource> {
  if (source.payerUserId === null) {
    return source;
  }

  const client = deps.clerkClient ?? (await getClerkClient());
  const subscription = await client.billing.getUserBillingSubscription(
    source.payerUserId,
  );

  return {
    ...clerkBillingSourceFromBackendSubscription(subscription),
    payerUserId: source.payerUserId,
  };
}

export async function applyClerkBillingSource(
  source: ClerkBillingProjectionSource,
  deps: ReconciliationDeps,
  options: { refreshFromClerk?: boolean } = {},
): Promise<ClerkBillingApplyResult> {
  const db = deps.db ?? serviceRoleDb;

  if (source.payerUserId === null) {
    deps.logger.warn(
      { type: source.type },
      'Clerk Billing event missing user payer; skipping projection',
    );
    return 'skipped';
  }

  const [user] = await db
    .select({
      id: users.id,
      authUserId: users.authUserId,
      subscriptionTier: users.subscriptionTier,
      subscriptionStatus: users.subscriptionStatus,
      subscriptionPeriodEnd: users.subscriptionPeriodEnd,
      cancelAtPeriodEnd: users.cancelAtPeriodEnd,
    })
    .from(users)
    .where(eq(users.authUserId, source.payerUserId))
    .limit(1);

  if (!user) {
    deps.logger.warn(
      { payerUserId: source.payerUserId, type: source.type },
      'No local user found for Clerk Billing payer; skipping projection',
    );
    return 'skipped';
  }

  const effectiveSource =
    options.refreshFromClerk === true
      ? await refreshClerkBillingSource(source, deps)
      : source;
  const projection = projectClerkBillingSource(effectiveSource, user);

  if (projection === null) {
    deps.logger.info(
      { authUserId: user.authUserId, type: effectiveSource.type },
      'Clerk Billing event did not require a local projection update',
    );
    return 'ignored';
  }

  await db
    .update(users)
    .set({
      ...projection,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  deps.logger.info(
    {
      authUserId: user.authUserId,
      subscriptionStatus: projection.subscriptionStatus,
      subscriptionTier: projection.subscriptionTier,
      type: effectiveSource.type,
      userId: user.id,
    },
    'Clerk Billing projection applied',
  );

  return 'updated';
}

async function dispatchVerifiedClerkBillingEvent(
  event: WebhookEvent,
  deps: ReconciliationDeps,
): Promise<ClerkBillingApplyResult> {
  const source = clerkBillingSourceFromWebhook(event);
  if (source === null) {
    deps.logger.debug(
      { type: event.type },
      'Ignored non-billing Clerk webhook event',
    );
    return 'ignored';
  }

  return applyClerkBillingSource(source, deps, { refreshFromClerk: true });
}

export async function applyVerifiedClerkBillingEvent(
  event: WebhookEvent,
  eventId: string,
  deps: ReconciliationDeps,
): Promise<ApplyVerifiedClerkBillingEventResult> {
  const db = deps.db ?? serviceRoleDb;

  const [insertedRow] = await db
    .insert(clerkWebhookEvents)
    .values({
      eventId,
      type: event.type,
    })
    .onConflictDoNothing({ target: clerkWebhookEvents.eventId })
    .returning({ eventId: clerkWebhookEvents.eventId });

  if (!insertedRow) {
    deps.logger.info(
      { eventId, type: event.type },
      'Duplicate Clerk webhook event skipped',
    );
    return { status: 'duplicate' };
  }

  try {
    const result = await dispatchVerifiedClerkBillingEvent(event, deps);
    return { status: 'inserted', result };
  } catch (error) {
    await db
      .delete(clerkWebhookEvents)
      .where(eq(clerkWebhookEvents.eventId, eventId));
    throw error;
  }
}

export async function reconcileClerkBillingEntitlements({
  clerkClient,
  db = serviceRoleDb,
  limit = DEFAULT_RECONCILIATION_LIMIT,
  logger,
  startingAfterAuthUserId,
}: ReconciliationDeps & {
  limit?: number;
  startingAfterAuthUserId?: string;
}): Promise<{
  checked: number;
  updated: number;
  skipped: number;
  ignored: number;
  failed: number;
  nextCursor: string | null;
}> {
  const client = clerkClient ?? (await getClerkClient());
  const batchLimit = Math.max(
    1,
    Math.min(Math.trunc(limit), MAX_RECONCILIATION_LIMIT),
  );
  const localUsers = startingAfterAuthUserId
    ? await db
        .select({
          authUserId: users.authUserId,
        })
        .from(users)
        .where(gt(users.authUserId, startingAfterAuthUserId))
        .orderBy(asc(users.authUserId))
        .limit(batchLimit + 1)
    : await db
        .select({
          authUserId: users.authUserId,
        })
        .from(users)
        .orderBy(asc(users.authUserId))
        .limit(batchLimit + 1);
  const batch = localUsers.slice(0, batchLimit);

  const totals = {
    checked: 0,
    updated: 0,
    skipped: 0,
    ignored: 0,
    failed: 0,
    nextCursor:
      localUsers.length > batchLimit
        ? (batch.at(-1)?.authUserId ?? null)
        : null,
  };

  for (const localUser of batch) {
    totals.checked += 1;

    try {
      const subscription = await client.billing.getUserBillingSubscription(
        localUser.authUserId,
      );
      const result = await applyClerkBillingSource(
        {
          ...clerkBillingSourceFromBackendSubscription(subscription),
          payerUserId: localUser.authUserId,
        },
        { db, logger },
      );

      totals[result] += 1;
    } catch (error) {
      totals.failed += 1;
      logger.error(
        { authUserId: localUser.authUserId, error },
        'Failed to reconcile Clerk Billing subscription',
      );
    }
  }

  return totals;
}
