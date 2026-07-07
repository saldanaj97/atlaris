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
