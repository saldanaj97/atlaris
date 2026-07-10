import type { DbClient } from '@/lib/db/types';
import type { EmailNotificationCategory } from '@/shared/types/db.types';
import type { EmailNotificationDeliveryStatus } from '@supabase/schema';

import { emailNotificationDeliveries } from '@supabase/schema';
import { and, eq, sql } from 'drizzle-orm';

export type EmailDeliveryClaimResult =
  | { outcome: 'claimed'; deliveryId: string }
  | { outcome: 'already_terminal'; status: 'sent' | 'skipped' }
  | { outcome: 'in_flight'; status: 'pending' };

type DeliveryDb = Pick<DbClient, 'execute' | 'insert' | 'update' | 'select'>;

/**
 * Atomically claim a delivery row for send. Terminal sent/skipped is final.
 * Failed rows can be reclaimed on the same key (retry). Concurrent pending
 * claims return in_flight without taking ownership.
 */
export async function claimEmailNotificationDelivery(
  args: {
    userId: string;
    category: EmailNotificationCategory;
    deliveryKey: string;
  },
  dbClient: DeliveryDb,
): Promise<EmailDeliveryClaimResult> {
  const inserted = await dbClient
    .insert(emailNotificationDeliveries)
    .values({
      userId: args.userId,
      category: args.category,
      deliveryKey: args.deliveryKey,
      status: 'pending',
    })
    .onConflictDoNothing({
      target: [
        emailNotificationDeliveries.userId,
        emailNotificationDeliveries.category,
        emailNotificationDeliveries.deliveryKey,
      ],
    })
    .returning({ id: emailNotificationDeliveries.id });

  if (inserted[0]) {
    return { outcome: 'claimed', deliveryId: inserted[0].id };
  }

  const reclaimed = await dbClient
    .update(emailNotificationDeliveries)
    .set({
      status: 'pending',
      failureClass: null,
      providerMessageId: null,
      updatedAt: sql<Date>`now()`,
    })
    .where(
      and(
        eq(emailNotificationDeliveries.userId, args.userId),
        eq(emailNotificationDeliveries.category, args.category),
        eq(emailNotificationDeliveries.deliveryKey, args.deliveryKey),
        eq(emailNotificationDeliveries.status, 'failed'),
      ),
    )
    .returning({ id: emailNotificationDeliveries.id });

  if (reclaimed[0]) {
    return { outcome: 'claimed', deliveryId: reclaimed[0].id };
  }

  const [existing] = await dbClient
    .select({
      status: emailNotificationDeliveries.status,
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

  if (existing.status === 'sent' || existing.status === 'skipped') {
    return { outcome: 'already_terminal', status: existing.status };
  }

  return { outcome: 'in_flight', status: 'pending' };
}

export async function markEmailNotificationDeliverySent(
  deliveryId: string,
  providerMessageId: string | null,
  dbClient: Pick<DbClient, 'update'>,
): Promise<void> {
  await dbClient
    .update(emailNotificationDeliveries)
    .set({
      status: 'sent',
      providerMessageId,
      failureClass: null,
      updatedAt: sql<Date>`now()`,
    })
    .where(eq(emailNotificationDeliveries.id, deliveryId));
}

export async function markEmailNotificationDeliverySkipped(
  deliveryId: string,
  failureClass: string,
  dbClient: Pick<DbClient, 'update'>,
): Promise<void> {
  await dbClient
    .update(emailNotificationDeliveries)
    .set({
      status: 'skipped',
      failureClass,
      updatedAt: sql<Date>`now()`,
    })
    .where(eq(emailNotificationDeliveries.id, deliveryId));
}

export async function markEmailNotificationDeliveryFailed(
  deliveryId: string,
  failureClass: string,
  dbClient: Pick<DbClient, 'update'>,
): Promise<void> {
  await dbClient
    .update(emailNotificationDeliveries)
    .set({
      status: 'failed',
      failureClass,
      updatedAt: sql<Date>`now()`,
    })
    .where(eq(emailNotificationDeliveries.id, deliveryId));
}

export type { EmailNotificationDeliveryStatus };
