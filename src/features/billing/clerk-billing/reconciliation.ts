import type { DbTransaction } from '@/lib/db/types';
import type { Logger } from '@/lib/logging/logger';
import type { WebhookEvent } from '@clerk/nextjs/webhooks';

import {
  applyClerkUserProjectionSource,
  clerkUserProjectionSourceFromWebhook,
  type ClerkUserProjectionApplyResult,
  type ClerkUserProjectionSource,
} from '@/features/auth/clerk-user-projection';
import {
  clerkBillingSourceFromBackendSubscription,
  clerkBillingSourceFromWebhook,
  projectClerkBillingSource,
  type BackendBillingSubscription,
  type ClerkBillingProjectionSource,
} from '@/features/billing/clerk-billing/projection';
import { clerkClient as getClerkClient } from '@clerk/nextjs/server';
import {
  clerkWebhookEventClaims,
  clerkWebhookEvents,
  users,
} from '@supabase/schema';
import { db as serviceRoleDb } from '@supabase/service-role';
import { and, asc, eq, gt, lte, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

type ServiceRoleDb = typeof serviceRoleDb;
type ReconciliationDb = Pick<DbTransaction, 'select' | 'update'>;

type ReconciliationDeps = {
  db?: ReconciliationDb;
  clerkClient?: ClerkBillingClient;
  logger: Logger;
};

type ApplyVerifiedClerkBillingEventDeps = Omit<ReconciliationDeps, 'db'> & {
  db?: ServiceRoleDb;
  createClaimToken?: () => string;
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
export const CLERK_BILLING_WEBHOOK_LEASE_MS = 2 * 60 * 1000;

export type ClerkBillingApplyResult =
  | 'updated'
  | 'skipped_no_payer'
  | 'skipped_no_user'
  | 'ignored';

type ClerkWebhookProjectionSource =
  | { kind: 'billing'; source: ClerkBillingProjectionSource }
  | { kind: 'user'; source: ClerkUserProjectionSource };

type ClerkWebhookApplyResult =
  | ClerkBillingApplyResult
  | ClerkUserProjectionApplyResult;

export type ApplyVerifiedClerkBillingEventResult =
  | { status: 'duplicate' }
  | { status: 'in_flight'; retryAfterSeconds: number }
  | { status: 'inserted'; result: ClerkWebhookApplyResult };

type ClerkWebhookClaimResult =
  | { outcome: 'claimed'; claimToken: string }
  | { outcome: 'duplicate' }
  | { outcome: 'in_flight'; retryAfterSeconds: number };

export class ClerkWebhookLeaseLostError extends Error {
  constructor() {
    super('Clerk webhook claim was lost before finalization');
    this.name = 'ClerkWebhookLeaseLostError';
  }
}

function leaseExpirySql() {
  return sql<Date>`now() + ${CLERK_BILLING_WEBHOOK_LEASE_MS} * interval '1 millisecond'`;
}

async function claimClerkWebhookEvent(
  eventId: string,
  deps: ApplyVerifiedClerkBillingEventDeps,
  retryAttempt = 0,
): Promise<ClerkWebhookClaimResult> {
  const db = deps.db ?? serviceRoleDb;
  const claimToken = deps.createClaimToken?.() ?? randomUUID();

  const [completedBeforeClaim] = await db
    .select({ eventId: clerkWebhookEvents.eventId })
    .from(clerkWebhookEvents)
    .where(eq(clerkWebhookEvents.eventId, eventId))
    .limit(1);

  if (completedBeforeClaim) {
    await db
      .delete(clerkWebhookEventClaims)
      .where(eq(clerkWebhookEventClaims.eventId, eventId));
    deps.logger.info(
      { eventId },
      'Clerk webhook event already completed; duplicate skipped',
    );
    return { outcome: 'duplicate' };
  }

  const expiry = leaseExpirySql();
  const [claimed] = await db
    .insert(clerkWebhookEventClaims)
    .values({
      eventId,
      claimToken,
      claimExpiresAt: expiry,
    })
    .onConflictDoUpdate({
      target: clerkWebhookEventClaims.eventId,
      set: {
        claimToken,
        claimExpiresAt: expiry,
      },
      setWhere: lte(clerkWebhookEventClaims.claimExpiresAt, sql`now()`),
    })
    .returning({ claimToken: clerkWebhookEventClaims.claimToken });

  if (claimed?.claimToken) {
    return { outcome: 'claimed', claimToken: claimed.claimToken };
  }

  const [completed] = await db
    .select({ eventId: clerkWebhookEvents.eventId })
    .from(clerkWebhookEvents)
    .where(eq(clerkWebhookEvents.eventId, eventId))
    .limit(1);

  if (completed) {
    await db
      .delete(clerkWebhookEventClaims)
      .where(eq(clerkWebhookEventClaims.eventId, eventId));
    deps.logger.info(
      { eventId },
      'Clerk webhook event already completed; duplicate skipped',
    );
    return { outcome: 'duplicate' };
  }

  const [activeClaim] = await db
    .select({
      retryAfterSeconds: sql<number>`greatest(1, ceil(extract(epoch from (${clerkWebhookEventClaims.claimExpiresAt} - now()))))::int`,
    })
    .from(clerkWebhookEventClaims)
    .where(eq(clerkWebhookEventClaims.eventId, eventId))
    .limit(1);

  if (!activeClaim) {
    if (retryAttempt === 0) {
      return claimClerkWebhookEvent(eventId, deps, retryAttempt + 1);
    }
    deps.logger.info(
      { eventId },
      'Clerk webhook claim changed during contention; retry requested',
    );
    return { outcome: 'in_flight', retryAfterSeconds: 1 };
  }

  const retryAfterSeconds = Math.max(1, Number(activeClaim.retryAfterSeconds));
  deps.logger.info(
    { eventId, retryAfterSeconds },
    'Clerk webhook event is already being processed; retry requested',
  );
  return { outcome: 'in_flight', retryAfterSeconds };
}

async function releaseClerkWebhookClaim(
  eventId: string,
  claimToken: string,
  deps: ApplyVerifiedClerkBillingEventDeps,
): Promise<void> {
  const db = deps.db ?? serviceRoleDb;
  await db
    .delete(clerkWebhookEventClaims)
    .where(
      and(
        eq(clerkWebhookEventClaims.eventId, eventId),
        eq(clerkWebhookEventClaims.claimToken, claimToken),
      ),
    );
}

async function finalizeClerkWebhookEvent(
  args: {
    event: WebhookEvent;
    eventId: string;
    claimToken: string;
    projectionSource: ClerkWebhookProjectionSource | null;
  },
  deps: ApplyVerifiedClerkBillingEventDeps,
): Promise<ApplyVerifiedClerkBillingEventResult> {
  const db = deps.db ?? serviceRoleDb;

  return db.transaction(async (tx) => {
    const [ownedClaim] = await tx
      .delete(clerkWebhookEventClaims)
      .where(
        and(
          eq(clerkWebhookEventClaims.eventId, args.eventId),
          eq(clerkWebhookEventClaims.claimToken, args.claimToken),
        ),
      )
      .returning({ eventId: clerkWebhookEventClaims.eventId });

    if (!ownedClaim) {
      const [completed] = await tx
        .select({ eventId: clerkWebhookEvents.eventId })
        .from(clerkWebhookEvents)
        .where(eq(clerkWebhookEvents.eventId, args.eventId))
        .limit(1);

      if (completed) {
        return { status: 'duplicate' };
      }
      throw new ClerkWebhookLeaseLostError();
    }

    const [insertedRow] = await tx
      .insert(clerkWebhookEvents)
      .values({
        eventId: args.eventId,
        type: args.event.type,
      })
      .onConflictDoNothing({ target: clerkWebhookEvents.eventId })
      .returning({ eventId: clerkWebhookEvents.eventId });

    if (!insertedRow) {
      return { status: 'duplicate' };
    }

    if (args.projectionSource === null) {
      deps.logger.debug(
        { type: args.event.type },
        'Ignored unsupported Clerk webhook event',
      );
      return { status: 'inserted', result: 'ignored' };
    }

    if (args.projectionSource.kind === 'billing') {
      const result = await applyClerkBillingSource(
        args.projectionSource.source,
        {
          ...deps,
          db: tx,
        },
      );
      if (result === 'skipped_no_user') {
        throw new Error('No local user found for Clerk Billing payer');
      }
      return { status: 'inserted', result };
    }

    const result = await applyClerkUserProjectionSource(
      args.projectionSource.source,
      { ...deps, db: tx },
    );
    if (
      result === 'skipped_no_user' &&
      args.projectionSource.source.kind === 'deleted'
    ) {
      throw new Error('No local user found for Clerk deletion event');
    }
    return { status: 'inserted', result };
  });
}

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
  const refreshedSource =
    clerkBillingSourceFromBackendSubscription(subscription);

  return {
    ...refreshedSource,
    type: source.type,
    payerUserId: source.payerUserId,
    paymentAttemptStatus:
      source.paymentAttemptStatus ?? refreshedSource.paymentAttemptStatus,
  };
}

export async function applyClerkBillingSource(
  source: ClerkBillingProjectionSource,
  deps: ReconciliationDeps,
): Promise<ClerkBillingApplyResult> {
  const db: ReconciliationDb = deps.db ?? serviceRoleDb;

  if (source.payerUserId === null) {
    deps.logger.warn(
      { type: source.type },
      'Clerk Billing event missing user payer; skipping projection',
    );
    return 'skipped_no_payer';
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
    return 'skipped_no_user';
  }

  const projection = projectClerkBillingSource(source, user);

  if (projection === null) {
    deps.logger.info(
      { authUserId: user.authUserId, type: source.type },
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
      type: source.type,
      userId: user.id,
    },
    'Clerk Billing projection applied',
  );

  return 'updated';
}

export async function applyVerifiedClerkBillingEvent(
  event: WebhookEvent,
  eventId: string,
  deps: ApplyVerifiedClerkBillingEventDeps,
): Promise<ApplyVerifiedClerkBillingEventResult> {
  let claimToken: string | undefined;

  try {
    const claim = await claimClerkWebhookEvent(eventId, deps);
    if (claim.outcome === 'duplicate') {
      return { status: 'duplicate' };
    }
    if (claim.outcome === 'in_flight') {
      return {
        status: 'in_flight',
        retryAfterSeconds: claim.retryAfterSeconds,
      };
    }

    claimToken = claim.claimToken;
    const billingSource = clerkBillingSourceFromWebhook(event);
    const userSource = billingSource
      ? null
      : clerkUserProjectionSourceFromWebhook(event);
    const projectionSource: ClerkWebhookProjectionSource | null = billingSource
      ? {
          kind: 'billing',
          source: await refreshClerkBillingSource(billingSource, deps),
        }
      : userSource
        ? { kind: 'user', source: userSource }
        : null;

    return await finalizeClerkWebhookEvent(
      {
        event,
        eventId,
        claimToken,
        projectionSource,
      },
      deps,
    );
  } catch (error) {
    if (claimToken) {
      try {
        await releaseClerkWebhookClaim(eventId, claimToken, deps);
      } catch (releaseError) {
        deps.logger.error(
          { error: releaseError, eventId },
          'Failed to release Clerk webhook claim after processing error',
        );
      }
    }
    deps.logger.warn(
      { error, eventId, type: event.type },
      'Clerk Billing webhook processing failed; retry requested',
    );
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

      if (result === 'skipped_no_payer' || result === 'skipped_no_user') {
        totals.skipped += 1;
      } else {
        totals[result] += 1;
      }
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
