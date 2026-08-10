import type { DbTransaction } from '@/lib/db/types';
import type { Logger } from '@/lib/logging/logger';
import type { WebhookEvent } from '@clerk/nextjs/webhooks';

import { users } from '@supabase/schema';
import { and, asc, eq, gt, isNull, lt, lte, or } from 'drizzle-orm';

type UserProjectionDb = Pick<DbTransaction, 'select' | 'update'>;

type ClerkUserEmailAddress = {
  id: string;
  email: string;
  verificationStatus: string | null;
};

type ClerkWebhookUser = {
  id: string;
  updated_at: number;
  primary_email_address_id: string | null;
  email_addresses: readonly {
    id: string;
    email_address: string;
    verification: { status?: string } | null;
  }[];
};

export type ClerkBackendUser = {
  id: string;
  updatedAt: number;
  primaryEmailAddressId: string | null;
  emailAddresses: readonly {
    id: string;
    emailAddress: string;
    verification: { status?: string } | null;
  }[];
};

export type ClerkUserProjectionSource =
  | {
      readonly kind: 'upsert';
      readonly origin: 'webhook' | 'reconciliation';
      readonly type: 'user.created' | 'user.updated';
      readonly authUserId: string;
      readonly email: string | null;
      readonly clerkUserUpdatedAt: Date;
    }
  | {
      readonly kind: 'deleted';
      readonly type: 'user.deleted';
      readonly authUserId: string;
      readonly clerkDeletedAt: Date;
    };

export type ClerkUserProjectionApplyResult =
  | 'updated'
  | 'skipped_no_user'
  | 'skipped_deleted_user'
  | 'ignored';

export type ClerkUserIdentityClient = {
  users: {
    getUser(authUserId: string): Promise<ClerkBackendUser>;
  };
};

type LocalUserProjection = {
  id: string;
  authUserId: string;
  email: string | null;
  clerkUserUpdatedAt: Date | null;
  clerkDeletedAt: Date | null;
};

function verifiedPrimaryEmail(
  primaryEmailAddressId: string | null,
  emailAddresses: readonly ClerkUserEmailAddress[],
): string | null {
  if (!primaryEmailAddressId) {
    return null;
  }

  const primaryEmail = emailAddresses.find(
    (email) => email.id === primaryEmailAddressId,
  );
  return primaryEmail?.verificationStatus === 'verified' &&
    primaryEmail.email !== ''
    ? primaryEmail.email
    : null;
}

function dateFromClerkTimestamp(timestamp: number): Date {
  const date = new Date(timestamp);
  if (!Number.isFinite(timestamp) || Number.isNaN(date.getTime())) {
    throw new Error('Clerk user event has an invalid updated_at timestamp');
  }
  return date;
}

function webhookEmailAddresses(
  emailAddresses: ClerkWebhookUser['email_addresses'],
): ClerkUserEmailAddress[] {
  return emailAddresses.map((email) => ({
    id: email.id,
    email: email.email_address,
    verificationStatus: email.verification?.status ?? null,
  }));
}

function backendEmailAddresses(
  emailAddresses: ClerkBackendUser['emailAddresses'],
): ClerkUserEmailAddress[] {
  return emailAddresses.map((email) => ({
    id: email.id,
    email: email.emailAddress,
    verificationStatus: email.verification?.status ?? null,
  }));
}

export function clerkUserProjectionSourceFromWebhook(
  event: WebhookEvent,
  receivedAt = new Date(),
): ClerkUserProjectionSource | null {
  if (event.type === 'user.created' || event.type === 'user.updated') {
    const user = event.data as ClerkWebhookUser;
    return {
      kind: 'upsert',
      origin: 'webhook',
      type: event.type,
      authUserId: user.id,
      email: verifiedPrimaryEmail(
        user.primary_email_address_id,
        webhookEmailAddresses(user.email_addresses),
      ),
      clerkUserUpdatedAt: dateFromClerkTimestamp(user.updated_at),
    };
  }

  if (event.type === 'user.deleted') {
    const authUserId = event.data.id;
    return typeof authUserId === 'string' && authUserId !== ''
      ? {
          kind: 'deleted',
          type: event.type,
          authUserId,
          clerkDeletedAt: receivedAt,
        }
      : null;
  }

  return null;
}

export function clerkUserProjectionSourceFromBackendUser(
  user: ClerkBackendUser,
): ClerkUserProjectionSource {
  return {
    kind: 'upsert',
    origin: 'reconciliation',
    type: 'user.updated',
    authUserId: user.id,
    email: verifiedPrimaryEmail(
      user.primaryEmailAddressId,
      backendEmailAddresses(user.emailAddresses),
    ),
    clerkUserUpdatedAt: dateFromClerkTimestamp(user.updatedAt),
  };
}

export function clerkUserDeletionProjectionSource(
  authUserId: string,
  clerkDeletedAt = new Date(),
): ClerkUserProjectionSource {
  if (authUserId.trim() === '') {
    throw new Error('Cannot tombstone a Clerk user without an id');
  }
  return {
    kind: 'deleted',
    type: 'user.deleted',
    authUserId,
    clerkDeletedAt,
  };
}

function projectedApplyResult(
  source: ClerkUserProjectionSource,
  user: LocalUserProjection,
): ClerkUserProjectionApplyResult {
  if (source.kind === 'deleted') {
    return user.clerkDeletedAt === null ? 'updated' : 'skipped_deleted_user';
  }

  if (user.clerkDeletedAt !== null) {
    return 'skipped_deleted_user';
  }

  if (user.clerkUserUpdatedAt !== null) {
    const sourceUpdatedAt = source.clerkUserUpdatedAt.getTime();
    const localUpdatedAt = user.clerkUserUpdatedAt.getTime();
    if (
      sourceUpdatedAt < localUpdatedAt ||
      (sourceUpdatedAt === localUpdatedAt &&
        (source.origin === 'webhook' || source.email === user.email))
    ) {
      return 'ignored';
    }
  }

  return 'updated';
}

export async function applyClerkUserProjectionSource(
  source: ClerkUserProjectionSource,
  deps: { db: UserProjectionDb; logger: Pick<Logger, 'info' | 'warn'> },
): Promise<ClerkUserProjectionApplyResult> {
  const [user] = await deps.db
    .select({
      id: users.id,
      authUserId: users.authUserId,
      email: users.email,
      clerkUserUpdatedAt: users.clerkUserUpdatedAt,
      clerkDeletedAt: users.clerkDeletedAt,
    })
    .from(users)
    .where(eq(users.authUserId, source.authUserId))
    .limit(1);

  if (!user) {
    deps.logger.info(
      { authUserId: source.authUserId, type: source.type },
      'No local user found for Clerk identity event; skipping projection',
    );
    return 'skipped_no_user';
  }

  if (source.kind === 'deleted') {
    const [updated] = await deps.db
      .update(users)
      .set({
        email: null,
        clerkDeletedAt: source.clerkDeletedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, user.id), isNull(users.clerkDeletedAt)))
      .returning({ id: users.id });

    if (!updated) {
      return 'skipped_deleted_user';
    }

    deps.logger.info(
      { authUserId: user.authUserId, type: source.type, userId: user.id },
      'Clerk user deletion tombstone applied',
    );
    return 'updated';
  }

  const projectedResult = projectedApplyResult(source, user);
  if (projectedResult === 'skipped_deleted_user') {
    deps.logger.warn(
      { authUserId: user.authUserId, type: source.type, userId: user.id },
      'Ignored Clerk identity update for tombstoned local user',
    );
    return 'skipped_deleted_user';
  }

  if (projectedResult === 'ignored') {
    return 'ignored';
  }

  const [updated] = await deps.db
    .update(users)
    .set({
      email: source.email,
      clerkUserUpdatedAt: source.clerkUserUpdatedAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(users.id, user.id),
        isNull(users.clerkDeletedAt),
        source.origin === 'webhook'
          ? or(
              isNull(users.clerkUserUpdatedAt),
              lt(users.clerkUserUpdatedAt, source.clerkUserUpdatedAt),
            )
          : or(
              isNull(users.clerkUserUpdatedAt),
              lte(users.clerkUserUpdatedAt, source.clerkUserUpdatedAt),
            ),
      ),
    )
    .returning({ id: users.id });

  if (!updated) {
    return 'ignored';
  }

  deps.logger.info(
    { authUserId: user.authUserId, type: source.type, userId: user.id },
    'Clerk user identity projection applied',
  );
  return 'updated';
}

function isClerkNotFound(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'status' in error &&
    (error as { status?: unknown }).status === 404
  );
}

export type ClerkUserIdentityReconciliationResult = {
  checked: number;
  updated: number;
  tombstoned: number;
  wouldUpdate: number;
  wouldTombstone: number;
  skipped: number;
  ignored: number;
  failed: number;
  nextCursor: string | null;
};

export async function reconcileClerkUserIdentities({
  apply,
  clerkClient,
  db,
  limit = 100,
  logger,
  startingAfterAuthUserId,
}: {
  apply: boolean;
  clerkClient: ClerkUserIdentityClient;
  db: UserProjectionDb;
  limit?: number;
  logger: Pick<Logger, 'error' | 'info' | 'warn'>;
  startingAfterAuthUserId?: string;
}): Promise<ClerkUserIdentityReconciliationResult> {
  const batchLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
  const localUsers = startingAfterAuthUserId
    ? await db
        .select({
          id: users.id,
          authUserId: users.authUserId,
          email: users.email,
          clerkUserUpdatedAt: users.clerkUserUpdatedAt,
          clerkDeletedAt: users.clerkDeletedAt,
        })
        .from(users)
        .where(gt(users.authUserId, startingAfterAuthUserId))
        .orderBy(asc(users.authUserId))
        .limit(batchLimit + 1)
    : await db
        .select({
          id: users.id,
          authUserId: users.authUserId,
          email: users.email,
          clerkUserUpdatedAt: users.clerkUserUpdatedAt,
          clerkDeletedAt: users.clerkDeletedAt,
        })
        .from(users)
        .orderBy(asc(users.authUserId))
        .limit(batchLimit + 1);
  const batch = localUsers.slice(0, batchLimit);
  const totals: ClerkUserIdentityReconciliationResult = {
    checked: 0,
    updated: 0,
    tombstoned: 0,
    wouldUpdate: 0,
    wouldTombstone: 0,
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
      let source: ClerkUserProjectionSource;
      try {
        source = clerkUserProjectionSourceFromBackendUser(
          await clerkClient.users.getUser(localUser.authUserId),
        );
      } catch (error) {
        if (!isClerkNotFound(error)) {
          throw error;
        }
        source = clerkUserDeletionProjectionSource(localUser.authUserId);
      }

      const result = apply
        ? await applyClerkUserProjectionSource(source, { db, logger })
        : projectedApplyResult(source, localUser);
      if (result === 'updated') {
        if (source.kind === 'deleted') {
          totals[apply ? 'tombstoned' : 'wouldTombstone'] += 1;
        } else {
          totals[apply ? 'updated' : 'wouldUpdate'] += 1;
        }
      } else if (result === 'ignored') {
        totals.ignored += 1;
      } else {
        totals.skipped += 1;
      }
    } catch (error) {
      totals.failed += 1;
      logger.error(
        { authUserId: localUser.authUserId, error },
        'Failed to reconcile Clerk user identity',
      );
    }
  }

  return totals;
}
