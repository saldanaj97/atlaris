import { sql } from 'drizzle-orm';

import {
  googleCalendarSyncState,
  stripeWebhookEvents,
  taskCalendarEvents,
} from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

export async function ensureStripeWebhookEvents() {
  await db.select().from(stripeWebhookEvents).limit(1);
}

export async function ensureJobTypeEnumValue() {
  // Add plan_regeneration to job_type enum if it doesn't exist
  // This handles the case where the enum value needs to be added for tests
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'plan_regeneration'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'job_type')
      ) THEN
        ALTER TYPE job_type ADD VALUE 'plan_regeneration';
      END IF;
    END $$;
  `);
}

/**
 * Ensures the google_calendar_sync_state table exists using Drizzle's schema/migration system.
 */
export async function ensureGoogleCalendarSyncState() {
  await db.select().from(googleCalendarSyncState).limit(1);
}

/**
 * Ensures the task_calendar_events table exists using Drizzle's schema/migration system.
 */
export async function ensureTaskCalendarEvents() {
  await db.select().from(taskCalendarEvents).limit(1);
}
