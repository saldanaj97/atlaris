import { emailNotificationCategory } from '../../enums';
import { timestampFields } from '../helpers';
import { users } from './users';
import { sql } from 'drizzle-orm';
import {
  index,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const emailNotificationDeliveryStatus = pgEnum(
  'email_notification_delivery_status',
  ['pending', 'sent', 'skipped', 'failed'],
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
    index('idx_email_notification_deliveries_status_updated_at').on(
      table.status,
      table.updatedAt,
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
