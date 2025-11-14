import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { serviceRole } from './common';

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
    pgPolicy('stripe_webhook_events_select_service', {
      for: 'select',
      to: serviceRole,
      using: sql`true`,
    }),
    pgPolicy('stripe_webhook_events_insert_service', {
      for: 'insert',
      to: serviceRole,
      withCheck: sql`true`,
    }),
  ]
).enableRLS();
