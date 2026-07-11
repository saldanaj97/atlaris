import { emailNotificationCategory } from '../../enums';
import { timestampFields } from '../helpers';
import { users } from './users';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const emailNotificationDeliveryStatus = pgEnum(
  'email_notification_delivery_status',
  ['pending', 'sent', 'skipped', 'failed', 'manual_review'],
);

export type EmailNotificationDeliveryStatus =
  (typeof emailNotificationDeliveryStatus.enumValues)[number];

/**
 * Idempotent delivery ledger for optional email notifications.
 * Unique (user_id, category, delivery_key); service-role only (deny authenticated).
 */
export const emailNotificationDeliveries = pgTable(
  'email_notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: emailNotificationCategory('category').notNull(),
    deliveryKey: text('delivery_key').notNull(),
    status: emailNotificationDeliveryStatus('status')
      .notNull()
      .default('pending'),
    claimToken: uuid('claim_token'),
    claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
    providerRequest: jsonb('provider_request').$type<Record<
      string,
      unknown
    > | null>(),
    attemptCount: integer('attempt_count').notNull().default(0),
    providerMessageId: text('provider_message_id'),
    failureClass: text('failure_class'),
    ...timestampFields,
  },
  (table) => [
    unique('email_notification_deliveries_user_category_key_unique').on(
      table.userId,
      table.category,
      table.deliveryKey,
    ),
    index('idx_email_notification_deliveries_run_summary').on(
      table.category,
      table.deliveryKey,
      table.status,
    ),
    index('idx_email_notification_deliveries_status_updated_at').on(
      table.status,
      table.updatedAt,
    ),
    index('idx_email_notification_deliveries_pending_claim_expires_at')
      .on(table.claimExpiresAt)
      .where(sql`${table.status} = 'pending'`),
    check(
      'email_notification_deliveries_pending_claim_required',
      sql`${table.status} <> 'pending' OR (
        ${table.claimToken} IS NOT NULL
        AND ${table.claimExpiresAt} IS NOT NULL
        AND ${table.providerRequest} IS NOT NULL
      )`,
    ),
    pgPolicy('email_notification_deliveries_deny_all', {
      as: 'restrictive',
      for: 'all',
      to: 'public',
      using: sql`false`,
      withCheck: sql`false`,
    }),
  ],
).enableRLS();
