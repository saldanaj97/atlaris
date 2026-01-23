import {
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

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
  ]
).enableRLS();
