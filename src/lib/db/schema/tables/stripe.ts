import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// Stripe webhook events

export const stripeWebhookEvents = pgTable(
  'stripe_webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: text('event_id').notNull(),
    livemode: boolean('livemode').notNull(),
    type: text('type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('stripe_webhook_events_event_id_unique').on(table.eventId),
    index('idx_stripe_webhook_events_created_at').on(table.createdAt),
  ]
).enableRLS();
