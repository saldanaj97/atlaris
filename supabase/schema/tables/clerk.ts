import { sql } from 'drizzle-orm';
import {
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// Clerk webhook events

export const clerkWebhookEvents = pgTable(
  'clerk_webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: text('event_id').notNull(),
    type: text('type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('clerk_webhook_events_event_id_unique').on(table.eventId),
    index('idx_clerk_webhook_events_created_at').on(table.createdAt),
    pgPolicy('clerk_webhook_events_deny_all', {
      as: 'restrictive',
      for: 'all',
      to: 'public',
      using: sql`false`,
      withCheck: sql`false`,
    }),
  ],
).enableRLS();

/**
 * Short-lived service-owned claims that prevent concurrent webhook deliveries
 * from refreshing the same Clerk subscription at the same time.
 *
 * The completed event ledger intentionally remains a separate table so older
 * application instances can continue to process events safely during a
 * rolling deploy or rollback.
 */
export const clerkWebhookEventClaims = pgTable(
  'clerk_webhook_event_claims',
  {
    eventId: text('event_id').primaryKey(),
    claimToken: uuid('claim_token').notNull(),
    claimExpiresAt: timestamp('claim_expires_at', {
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    index('idx_clerk_webhook_event_claims_expires_at').on(table.claimExpiresAt),
    pgPolicy('clerk_webhook_event_claims_deny_all', {
      as: 'restrictive',
      for: 'all',
      to: 'public',
      using: sql`false`,
      withCheck: sql`false`,
    }),
  ],
).enableRLS();
