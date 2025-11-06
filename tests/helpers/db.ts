import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import {
  generationAttempts,
  jobQueue,
  learningPlans,
  modules,
  planGenerations,
  resources,
  taskProgress,
  taskResources,
  tasks,
  stripeWebhookEvents,
  usageMetrics,
  users,
  notionSyncState,
  googleCalendarSyncState,
  taskCalendarEvents,
} from '@/lib/db/schema';

/**
 * Truncate core tables between tests to guarantee isolation.
 * Tables are truncated in dependency order to avoid deadlocks.
 */
const userIdCache = new Map<string, string>();

export async function truncateAll() {
  // Truncate tables individually in dependency order (children before parents)
  // This avoids deadlocks that can occur when truncating multiple tables at once
  await db.execute(
    sql`TRUNCATE TABLE ${generationAttempts} RESTART IDENTITY CASCADE`
  );
  await db.execute(sql`TRUNCATE TABLE ${jobQueue} RESTART IDENTITY CASCADE`);
  await db.execute(
    sql`TRUNCATE TABLE ${taskResources} RESTART IDENTITY CASCADE`
  );
  await db.execute(
    sql`TRUNCATE TABLE ${taskProgress} RESTART IDENTITY CASCADE`
  );
  await db.execute(sql`TRUNCATE TABLE ${tasks} RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE ${modules} RESTART IDENTITY CASCADE`);
  await db.execute(
    sql`TRUNCATE TABLE ${planGenerations} RESTART IDENTITY CASCADE`
  );
  await db.execute(
    sql`TRUNCATE TABLE ${learningPlans} RESTART IDENTITY CASCADE`
  );
  await db.execute(
    sql`TRUNCATE TABLE ${notionSyncState} RESTART IDENTITY CASCADE`
  );
  await db.execute(
    sql`TRUNCATE TABLE ${googleCalendarSyncState} RESTART IDENTITY CASCADE`
  );
  await db.execute(
    sql`TRUNCATE TABLE ${taskCalendarEvents} RESTART IDENTITY CASCADE`
  );
  await db.execute(
    sql`TRUNCATE TABLE ${stripeWebhookEvents} RESTART IDENTITY CASCADE`
  );
  await db.execute(
    sql`TRUNCATE TABLE ${usageMetrics} RESTART IDENTITY CASCADE`
  );
  await db.execute(sql`TRUNCATE TABLE ${users} RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE ${resources} RESTART IDENTITY CASCADE`);
  userIdCache.clear();
}

export async function ensureStripeWebhookEventsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      event_id text NOT NULL UNIQUE,
      livemode boolean NOT NULL,
      type text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS stripe_webhook_events_event_id_unique
    ON stripe_webhook_events (event_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_created_at
    ON stripe_webhook_events (created_at)
  `);
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
 * Ensures the notion_sync_state table exists using Drizzle's schema/migration system.
 * If migrations are run before tests, this function is unnecessary.
 * If dynamic creation is needed, use Drizzle's API.
 */
export async function ensureNotionSyncStateTable() {
  // If using Drizzle's migration system, the table will be created automatically.
  // If not, you can use Drizzle's schema API to ensure the table exists.
  // For example, you could run a dummy query to trigger table creation:
  await db.select().from(notionSyncState).limit(1);
  // If you need to ensure indexes, use Drizzle's migration system.
  // Remove raw SQL table/index creation to avoid duplication.
}

/**
 * Ensures the google_calendar_sync_state table exists using Drizzle's schema/migration system.
 */
export async function ensureGoogleCalendarSyncStateTable() {
  await db.select().from(googleCalendarSyncState).limit(1);
}

/**
 * Ensures the task_calendar_events table exists using Drizzle's schema/migration system.
 */
export async function ensureTaskCalendarEventsTable() {
  await db.select().from(taskCalendarEvents).limit(1);
}

// Cache table removed – no-op helper deleted

export async function ensureUser({
  clerkUserId,
  email,
  name,
  subscriptionTier,
}: {
  clerkUserId: string;
  email: string;
  name?: string;
  subscriptionTier?: 'free' | 'starter' | 'pro';
}): Promise<string> {
  //  Don't use cache - always check database
  // The cache is cleared by truncateAll but we want to ensure we always have fresh data

  // Try to find existing user first
  const existing = await db.query.users.findFirst({
    where: (fields, operators) => operators.eq(fields.clerkUserId, clerkUserId),
  });

  if (existing) {
    // If tier is specified and different from existing, update it
    if (subscriptionTier && existing.subscriptionTier !== subscriptionTier) {
      await db
        .update(users)
        .set({ subscriptionTier })
        .where(eq(users.id, existing.id));
    }
    userIdCache.set(clerkUserId, existing.id);
    return existing.id;
  }

  // User doesn't exist, create it
  const [inserted] = await db
    .insert(users)
    .values({
      clerkUserId,
      email,
      name: name ?? email,
      ...(subscriptionTier && { subscriptionTier }),
    })
    .returning({ id: users.id });

  if (!inserted?.id) {
    throw new Error(`Failed to create user for ${clerkUserId}`);
  }

  userIdCache.set(clerkUserId, inserted.id);
  return inserted.id;
}
