import type { PersistedProviderRequest } from '@/features/notifications/email/types';
import type { DbClient } from '@/lib/db/types';
import type { EmailNotificationCategory } from '@/shared/types/db.types';
import type { EmailNotificationDeliveryStatus } from '@supabase/schema';

import { emailNotificationDeliveries } from '@supabase/schema';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export const EMAIL_DELIVERY_LEASE_MS = 15 * 60 * 1000;
export const EMAIL_PROVIDER_IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

export type EmailDeliveryClaimResult =
  | {
      outcome: 'claimed';
      deliveryId: string;
      claimToken: string;
      providerRequest: PersistedProviderRequest;
      reusedProviderRequest: boolean;
    }
  | {
      outcome: 'already_terminal';
      status: 'sent' | 'skipped' | 'manual_review';
    }
  | { outcome: 'in_flight'; status: 'pending' }
  | { outcome: 'manual_review'; deliveryId: string };

export class EmailDeliveryLostLeaseError extends Error {
  constructor(message = 'Email delivery lease was lost before finalization') {
    super(message);
    this.name = 'EmailDeliveryLostLeaseError';
  }
}

type DeliveryDb = Pick<DbClient, 'execute' | 'insert' | 'update' | 'select'>;

export type EmailNotificationDeliveryLedgerSummary = {
  readonly sent: number;
  readonly skipped: number;
  readonly manualReview: number;
};

/**
 * The delivery ledger is authoritative when a workflow step is replayed after
 * a provider side effect but before its run counter checkpoint is committed.
 */
export async function summarizeEmailNotificationDeliveriesForRun(
  args: {
    categories: readonly EmailNotificationCategory[];
    deliveryKeys: readonly string[];
  },
  dbClient: Pick<DbClient, 'select'>,
): Promise<EmailNotificationDeliveryLedgerSummary> {
  const [result] = await dbClient
    .select({
      sent: sql<number>`count(*) filter (where ${emailNotificationDeliveries.status} = 'sent')::int`,
      skipped: sql<number>`count(*) filter (where ${emailNotificationDeliveries.status} = 'skipped')::int`,
      manualReview: sql<number>`count(*) filter (where ${emailNotificationDeliveries.status} = 'manual_review')::int`,
    })
    .from(emailNotificationDeliveries)
    .where(
      and(
        inArray(emailNotificationDeliveries.category, [...args.categories]),
        inArray(emailNotificationDeliveries.deliveryKey, [
          ...args.deliveryKeys,
        ]),
      ),
    );

  return {
    sent: Number(result?.sent ?? 0),
    skipped: Number(result?.skipped ?? 0),
    manualReview: Number(result?.manualReview ?? 0),
  };
}

export async function countEmailNotificationDeliveryManualReviews(
  args: {
    categories: readonly EmailNotificationCategory[];
    deliveryKeys: readonly string[];
  },
  dbClient: Pick<DbClient, 'select'>,
): Promise<number> {
  return (await summarizeEmailNotificationDeliveriesForRun(args, dbClient))
    .manualReview;
}

function asProviderRequest(value: unknown): PersistedProviderRequest | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Partial<PersistedProviderRequest>;
  if (
    typeof record.from !== 'string' ||
    typeof record.to !== 'string' ||
    typeof record.subject !== 'string' ||
    typeof record.html !== 'string' ||
    typeof record.text !== 'string' ||
    typeof record.idempotencyKey !== 'string'
  ) {
    return null;
  }
  return {
    from: record.from,
    to: record.to,
    subject: record.subject,
    html: record.html,
    text: record.text,
    idempotencyKey: record.idempotencyKey,
    ...(typeof record.replyTo === 'string' ? { replyTo: record.replyTo } : {}),
    ...(record.headers && typeof record.headers === 'object'
      ? { headers: record.headers as Record<string, string> }
      : {}),
  };
}

function leaseExpiry(now: Date): Date {
  return new Date(now.getTime() + EMAIL_DELIVERY_LEASE_MS);
}

async function readCurrentClaimResult(
  deliveryId: string,
  dbClient: Pick<DbClient, 'select'>,
): Promise<EmailDeliveryClaimResult> {
  const [current] = await dbClient
    .select({ status: emailNotificationDeliveries.status })
    .from(emailNotificationDeliveries)
    .where(eq(emailNotificationDeliveries.id, deliveryId));

  if (!current) {
    throw new Error('Delivery ledger row missing after lost claim race');
  }

  if (
    current.status === 'sent' ||
    current.status === 'skipped' ||
    current.status === 'manual_review'
  ) {
    return { outcome: 'already_terminal', status: current.status };
  }

  // A concurrent worker owns or may immediately reclaim any non-terminal row.
  // Do not send from a stale claim snapshot.
  return { outcome: 'in_flight', status: 'pending' };
}

/**
 * Atomically claim a delivery row for send. Terminal sent/skipped/manual_review
 * is final. Failed rows and expired pending leases can be reclaimed only with
 * their persisted request. Fresh pending leases return in_flight. Ambiguous
 * pending older than the provider window becomes manual_review.
 */
export async function claimEmailNotificationDelivery(
  args: {
    userId: string;
    category: EmailNotificationCategory;
    deliveryKey: string;
    providerRequest: PersistedProviderRequest;
    now?: Date;
  },
  dbClient: DeliveryDb,
): Promise<EmailDeliveryClaimResult> {
  const now = args.now ?? new Date();
  const claimToken = randomUUID();
  const claimExpiresAt = leaseExpiry(now);

  const inserted = await dbClient
    .insert(emailNotificationDeliveries)
    .values({
      userId: args.userId,
      category: args.category,
      deliveryKey: args.deliveryKey,
      status: 'pending',
      claimToken,
      claimExpiresAt,
      providerRequest: args.providerRequest,
      attemptCount: 1,
      // Keep ledger timestamps aligned with the injected delivery clock so
      // ambiguity-window checks stay consistent in tests and scheduled runs.
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [
        emailNotificationDeliveries.userId,
        emailNotificationDeliveries.category,
        emailNotificationDeliveries.deliveryKey,
      ],
    })
    .returning({
      id: emailNotificationDeliveries.id,
      claimToken: emailNotificationDeliveries.claimToken,
      providerRequest: emailNotificationDeliveries.providerRequest,
    });

  if (inserted[0]?.claimToken) {
    const stored = asProviderRequest(inserted[0].providerRequest);
    if (!stored) {
      throw new Error('Inserted delivery row missing provider request');
    }
    return {
      outcome: 'claimed',
      deliveryId: inserted[0].id,
      claimToken: inserted[0].claimToken,
      providerRequest: stored,
      reusedProviderRequest: false,
    };
  }

  const [existing] = await dbClient
    .select({
      id: emailNotificationDeliveries.id,
      status: emailNotificationDeliveries.status,
      claimToken: emailNotificationDeliveries.claimToken,
      claimExpiresAt: emailNotificationDeliveries.claimExpiresAt,
      providerRequest: emailNotificationDeliveries.providerRequest,
      updatedAt: emailNotificationDeliveries.updatedAt,
      createdAt: emailNotificationDeliveries.createdAt,
    })
    .from(emailNotificationDeliveries)
    .where(
      and(
        eq(emailNotificationDeliveries.userId, args.userId),
        eq(emailNotificationDeliveries.category, args.category),
        eq(emailNotificationDeliveries.deliveryKey, args.deliveryKey),
      ),
    );

  if (!existing) {
    throw new Error('Delivery ledger row missing after claim race');
  }

  if (
    existing.status === 'sent' ||
    existing.status === 'skipped' ||
    existing.status === 'manual_review'
  ) {
    return { outcome: 'already_terminal', status: existing.status };
  }

  if (existing.status === 'failed') {
    const previousRequest = asProviderRequest(existing.providerRequest);
    if (!previousRequest) {
      throw new Error('Failed delivery missing provider request');
    }

    const reclaimed = await dbClient
      .update(emailNotificationDeliveries)
      .set({
        status: 'pending',
        failureClass: null,
        providerMessageId: null,
        claimToken,
        claimExpiresAt,
        providerRequest: previousRequest,
        attemptCount: sql`${emailNotificationDeliveries.attemptCount} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(emailNotificationDeliveries.id, existing.id),
          eq(emailNotificationDeliveries.status, 'failed'),
          existing.claimToken === null
            ? isNull(emailNotificationDeliveries.claimToken)
            : eq(emailNotificationDeliveries.claimToken, existing.claimToken),
          existing.claimExpiresAt === null
            ? isNull(emailNotificationDeliveries.claimExpiresAt)
            : eq(
                emailNotificationDeliveries.claimExpiresAt,
                existing.claimExpiresAt,
              ),
        ),
      )
      .returning({
        id: emailNotificationDeliveries.id,
        claimToken: emailNotificationDeliveries.claimToken,
        providerRequest: emailNotificationDeliveries.providerRequest,
      });

    if (reclaimed[0]?.claimToken) {
      const stored = asProviderRequest(reclaimed[0].providerRequest);
      if (!stored) {
        throw new Error('Reclaimed failed delivery missing provider request');
      }
      return {
        outcome: 'claimed',
        deliveryId: reclaimed[0].id,
        claimToken: reclaimed[0].claimToken,
        providerRequest: stored,
        reusedProviderRequest: true,
      };
    }

    return readCurrentClaimResult(existing.id, dbClient);
  }

  if (existing.status === 'pending') {
    const expiresAt = existing.claimExpiresAt;
    if (expiresAt && expiresAt.getTime() > now.getTime()) {
      return { outcome: 'in_flight', status: 'pending' };
    }

    // Measure ambiguity from first claim time; reclaim must not reset the window.
    const ambiguityStartedAt = existing.createdAt;
    const ageMs = now.getTime() - ambiguityStartedAt.getTime();
    if (ageMs > EMAIL_PROVIDER_IDEMPOTENCY_WINDOW_MS) {
      const reviewed = await dbClient
        .update(emailNotificationDeliveries)
        .set({
          status: 'manual_review',
          failureClass: 'provider_acceptance_ambiguous',
          claimToken: null,
          claimExpiresAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(emailNotificationDeliveries.id, existing.id),
            eq(emailNotificationDeliveries.status, 'pending'),
            existing.claimToken === null
              ? isNull(emailNotificationDeliveries.claimToken)
              : eq(emailNotificationDeliveries.claimToken, existing.claimToken),
            existing.claimExpiresAt === null
              ? isNull(emailNotificationDeliveries.claimExpiresAt)
              : eq(
                  emailNotificationDeliveries.claimExpiresAt,
                  existing.claimExpiresAt,
                ),
          ),
        )
        .returning({ id: emailNotificationDeliveries.id });

      if (reviewed[0]) {
        return { outcome: 'manual_review', deliveryId: reviewed[0].id };
      }
      return readCurrentClaimResult(existing.id, dbClient);
    }

    const storedRequest = asProviderRequest(existing.providerRequest);
    if (!storedRequest) {
      throw new Error('Expired pending delivery missing provider request');
    }

    const reclaimed = await dbClient
      .update(emailNotificationDeliveries)
      .set({
        claimToken,
        claimExpiresAt,
        attemptCount: sql`${emailNotificationDeliveries.attemptCount} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(emailNotificationDeliveries.id, existing.id),
          eq(emailNotificationDeliveries.status, 'pending'),
          existing.claimToken === null
            ? isNull(emailNotificationDeliveries.claimToken)
            : eq(emailNotificationDeliveries.claimToken, existing.claimToken),
          existing.claimExpiresAt === null
            ? isNull(emailNotificationDeliveries.claimExpiresAt)
            : eq(
                emailNotificationDeliveries.claimExpiresAt,
                existing.claimExpiresAt,
              ),
          sql`(
            ${emailNotificationDeliveries.claimExpiresAt} IS NULL
            OR ${emailNotificationDeliveries.claimExpiresAt} <= ${now.toISOString()}
          )`,
        ),
      )
      .returning({
        id: emailNotificationDeliveries.id,
        claimToken: emailNotificationDeliveries.claimToken,
        providerRequest: emailNotificationDeliveries.providerRequest,
      });

    if (reclaimed[0]?.claimToken) {
      const stored =
        asProviderRequest(reclaimed[0].providerRequest) ?? storedRequest;
      return {
        outcome: 'claimed',
        deliveryId: reclaimed[0].id,
        claimToken: reclaimed[0].claimToken,
        providerRequest: stored,
        reusedProviderRequest: true,
      };
    }

    return readCurrentClaimResult(existing.id, dbClient);
  }

  return { outcome: 'in_flight', status: 'pending' };
}

async function finalizePendingDelivery(
  args: {
    deliveryId: string;
    claimToken: string;
    values: {
      status: EmailNotificationDeliveryStatus;
      providerMessageId?: string | null;
      failureClass?: string | null;
      clearProviderRequest?: boolean;
    };
  },
  dbClient: Pick<DbClient, 'update'>,
): Promise<void> {
  const updated = await dbClient
    .update(emailNotificationDeliveries)
    .set({
      status: args.values.status,
      providerMessageId:
        args.values.providerMessageId === undefined
          ? undefined
          : args.values.providerMessageId,
      failureClass:
        args.values.failureClass === undefined
          ? undefined
          : args.values.failureClass,
      claimToken: null,
      claimExpiresAt: null,
      ...(args.values.clearProviderRequest ? { providerRequest: null } : {}),
      updatedAt: sql<Date>`now()`,
    })
    .where(
      and(
        eq(emailNotificationDeliveries.id, args.deliveryId),
        eq(emailNotificationDeliveries.status, 'pending'),
        eq(emailNotificationDeliveries.claimToken, args.claimToken),
      ),
    )
    .returning({ id: emailNotificationDeliveries.id });

  if (!updated[0]) {
    throw new EmailDeliveryLostLeaseError();
  }
}

export async function markEmailNotificationDeliverySent(
  args: {
    deliveryId: string;
    claimToken: string;
    providerMessageId: string | null;
  },
  dbClient: Pick<DbClient, 'update'>,
): Promise<void> {
  await finalizePendingDelivery(
    {
      deliveryId: args.deliveryId,
      claimToken: args.claimToken,
      values: {
        status: 'sent',
        providerMessageId: args.providerMessageId,
        failureClass: null,
        clearProviderRequest: true,
      },
    },
    dbClient,
  );
}

export async function markEmailNotificationDeliverySkipped(
  args: {
    deliveryId: string;
    claimToken: string;
    failureClass: string;
  },
  dbClient: Pick<DbClient, 'update'>,
): Promise<void> {
  await finalizePendingDelivery(
    {
      deliveryId: args.deliveryId,
      claimToken: args.claimToken,
      values: {
        status: 'skipped',
        failureClass: args.failureClass,
        clearProviderRequest: true,
      },
    },
    dbClient,
  );
}

export async function markEmailNotificationDeliveryFailed(
  args: {
    deliveryId: string;
    claimToken: string;
    failureClass: string;
  },
  dbClient: Pick<DbClient, 'update'>,
): Promise<void> {
  await finalizePendingDelivery(
    {
      deliveryId: args.deliveryId,
      claimToken: args.claimToken,
      values: {
        status: 'failed',
        failureClass: args.failureClass,
        clearProviderRequest: false,
      },
    },
    dbClient,
  );
}

export async function markEmailNotificationDeliveryManualReview(
  args: {
    deliveryId: string;
    claimToken: string;
    failureClass: string;
  },
  dbClient: Pick<DbClient, 'update'>,
): Promise<void> {
  await finalizePendingDelivery(
    {
      deliveryId: args.deliveryId,
      claimToken: args.claimToken,
      values: {
        status: 'manual_review',
        failureClass: args.failureClass,
        clearProviderRequest: false,
      },
    },
    dbClient,
  );
}

export type { EmailNotificationDeliveryStatus };
