import { eq, sql } from 'drizzle-orm';

import {
  aiUsageEvents,
  generationAttempts,
  googleCalendarSyncState,
  integrationTokens,
  jobQueue,
  learningPlans,
  modules,
  planGenerations,
  resources,
  stripeWebhookEvents,
  taskCalendarEvents,
  taskProgress,
  taskResources,
  tasks,
  usageMetrics,
  users,
} from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

/**
 * Truncate core tables between tests to guarantee isolation.
 * Tables are truncated in dependency order to avoid deadlocks.
 */

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
  await db.execute(
    sql`TRUNCATE TABLE ${aiUsageEvents} RESTART IDENTITY CASCADE`
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
    sql`TRUNCATE TABLE ${integrationTokens} RESTART IDENTITY CASCADE`
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
}

export async function resetDbForIntegrationTestFile() {
  await truncateAll();
  await ensureRlsRolesAndPermissions();
  await ensureJobTypeEnumValue();
}

export async function ensureStripeWebhookEvents() {
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
 * Ensure RLS roles exist and have the necessary permissions to query tables.
 * This mirrors the setup in CI workflows (.github/workflows/ci-pr.yml).
 *
 * Without these permissions, RLS-enforced database clients cannot access tables
 * even when RLS policies allow it, because the role itself lacks table permissions.
 */
export async function ensureRlsRolesAndPermissions() {
  // Create authenticated and anonymous roles if they don't exist
  await db.execute(sql`
    DO $$ BEGIN
      CREATE ROLE anonymous NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE ROLE authenticated NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END $$;
  `);

  // Create auth schema if it doesn't exist
  await db.execute(sql`
    CREATE SCHEMA IF NOT EXISTS auth;
  `);

  // Create auth.jwt() function for RLS policies
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql
    AS $$ SELECT COALESCE(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb) $$;
  `);

  // Grant schema access to RLS roles
  await db.execute(sql`
    GRANT USAGE ON SCHEMA public TO authenticated, anonymous;
  `);

  await db.execute(sql`
    GRANT USAGE ON SCHEMA auth TO authenticated, anonymous;
  `);

  // Grant table permissions to authenticated role
  await db.execute(sql`
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  `);

  // Grant read-only permissions to anonymous role
  await db.execute(sql`
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO anonymous;
  `);

  // Grant permissions on sequences (for auto-increment IDs)
  await db.execute(sql`
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anonymous;
  `);

  // Grant default permissions for future tables
  await db.execute(sql`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
  `);

  await db.execute(sql`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO anonymous;
  `);

  await db.execute(sql`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO authenticated, anonymous;
  `);

  // Repair critical authenticated ownership policies for test databases.
  // In ephemeral DBs provisioned via drizzle-kit push, policy qualifiers can
  // end up empty; this makes RLS checks deny access in ownership flows.
  // These explicit policies keep integration behavior aligned with app rules.
  await db.execute(sql`
    DROP POLICY IF EXISTS users_select_own ON users;
    DROP POLICY IF EXISTS users_insert_own ON users;
    DROP POLICY IF EXISTS users_update_own ON users;

    CREATE POLICY users_select_own ON users
      FOR SELECT
      TO authenticated
      USING (auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub');

    CREATE POLICY users_insert_own ON users
      FOR INSERT
      TO authenticated
      WITH CHECK (auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub');

    CREATE POLICY users_update_own ON users
      FOR UPDATE
      TO authenticated
      USING (auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub')
      WITH CHECK (auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub');

    DROP POLICY IF EXISTS learning_plans_select ON learning_plans;
    DROP POLICY IF EXISTS learning_plans_insert ON learning_plans;
    DROP POLICY IF EXISTS learning_plans_update ON learning_plans;
    DROP POLICY IF EXISTS learning_plans_delete ON learning_plans;

    CREATE POLICY learning_plans_select ON learning_plans
      FOR SELECT
      TO authenticated
      USING (
        user_id IN (
          SELECT id FROM users
          WHERE auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
        )
      );

    CREATE POLICY learning_plans_insert ON learning_plans
      FOR INSERT
      TO authenticated
      WITH CHECK (
        user_id IN (
          SELECT id FROM users
          WHERE auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
        )
      );

    CREATE POLICY learning_plans_update ON learning_plans
      FOR UPDATE
      TO authenticated
      USING (
        user_id IN (
          SELECT id FROM users
          WHERE auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
        )
      )
      WITH CHECK (
        user_id IN (
          SELECT id FROM users
          WHERE auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
        )
      );

    CREATE POLICY learning_plans_delete ON learning_plans
      FOR DELETE
      TO authenticated
      USING (
        user_id IN (
          SELECT id FROM users
          WHERE auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
        )
      );

    DROP POLICY IF EXISTS generation_attempts_select ON generation_attempts;
    DROP POLICY IF EXISTS generation_attempts_insert ON generation_attempts;
    DROP POLICY IF EXISTS generation_attempts_update ON generation_attempts;
    DROP POLICY IF EXISTS generation_attempts_delete_deny ON generation_attempts;

    CREATE POLICY generation_attempts_select ON generation_attempts
      FOR SELECT
      TO authenticated
      USING (
        plan_id IN (
          SELECT lp.id
          FROM learning_plans lp
          WHERE lp.user_id IN (
            SELECT id FROM users
            WHERE auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
          )
        )
      );

    CREATE POLICY generation_attempts_insert ON generation_attempts
      FOR INSERT
      TO authenticated
      WITH CHECK (
        plan_id IN (
          SELECT lp.id
          FROM learning_plans lp
          WHERE lp.user_id IN (
            SELECT id FROM users
            WHERE auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
          )
        )
      );

    CREATE POLICY generation_attempts_update ON generation_attempts
      FOR UPDATE
      TO authenticated
      USING (
        plan_id IN (
          SELECT lp.id
          FROM learning_plans lp
          WHERE lp.user_id IN (
            SELECT id FROM users
            WHERE auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
          )
        )
      )
      WITH CHECK (
        plan_id IN (
          SELECT lp.id
          FROM learning_plans lp
          WHERE lp.user_id IN (
            SELECT id FROM users
            WHERE auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
          )
        )
      );

    CREATE POLICY generation_attempts_delete_deny ON generation_attempts
      AS RESTRICTIVE
      FOR DELETE
      TO authenticated
      USING (false);

    DROP POLICY IF EXISTS modules_select_own_plan ON modules;
    DROP POLICY IF EXISTS modules_insert_own_plan ON modules;
    DROP POLICY IF EXISTS modules_update_own_plan ON modules;
    DROP POLICY IF EXISTS modules_delete_own_plan ON modules;

    CREATE POLICY modules_select_own_plan ON modules
      FOR SELECT
      TO authenticated
      USING (
        plan_id IN (
          SELECT lp.id
          FROM learning_plans lp
          WHERE lp.user_id IN (
            SELECT id FROM users
            WHERE auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
          )
        )
      );

    CREATE POLICY modules_insert_own_plan ON modules
      FOR INSERT
      TO authenticated
      WITH CHECK (
        plan_id IN (
          SELECT lp.id
          FROM learning_plans lp
          WHERE lp.user_id IN (
            SELECT id FROM users
            WHERE auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
          )
        )
      );

    CREATE POLICY modules_update_own_plan ON modules
      FOR UPDATE
      TO authenticated
      USING (
        plan_id IN (
          SELECT lp.id
          FROM learning_plans lp
          WHERE lp.user_id IN (
            SELECT id FROM users
            WHERE auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
          )
        )
      )
      WITH CHECK (
        plan_id IN (
          SELECT lp.id
          FROM learning_plans lp
          WHERE lp.user_id IN (
            SELECT id FROM users
            WHERE auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
          )
        )
      );

    CREATE POLICY modules_delete_own_plan ON modules
      FOR DELETE
      TO authenticated
      USING (
        plan_id IN (
          SELECT lp.id
          FROM learning_plans lp
          WHERE lp.user_id IN (
            SELECT id FROM users
            WHERE auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
          )
        )
      );

    DROP POLICY IF EXISTS tasks_select_own_plan ON tasks;
    DROP POLICY IF EXISTS tasks_insert_own_plan ON tasks;
    DROP POLICY IF EXISTS tasks_update_own_plan ON tasks;
    DROP POLICY IF EXISTS tasks_delete_own_plan ON tasks;

    CREATE POLICY tasks_select_own_plan ON tasks
      FOR SELECT
      TO authenticated
      USING (
        module_id IN (
          SELECT m.id
          FROM modules m
          JOIN learning_plans lp ON lp.id = m.plan_id
          WHERE lp.user_id IN (
            SELECT id FROM users
            WHERE auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
          )
        )
      );

    CREATE POLICY tasks_insert_own_plan ON tasks
      FOR INSERT
      TO authenticated
      WITH CHECK (
        module_id IN (
          SELECT m.id
          FROM modules m
          JOIN learning_plans lp ON lp.id = m.plan_id
          WHERE lp.user_id IN (
            SELECT id FROM users
            WHERE auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
          )
        )
      );

    CREATE POLICY tasks_update_own_plan ON tasks
      FOR UPDATE
      TO authenticated
      USING (
        module_id IN (
          SELECT m.id
          FROM modules m
          JOIN learning_plans lp ON lp.id = m.plan_id
          WHERE lp.user_id IN (
            SELECT id FROM users
            WHERE auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
          )
        )
      )
      WITH CHECK (
        module_id IN (
          SELECT m.id
          FROM modules m
          JOIN learning_plans lp ON lp.id = m.plan_id
          WHERE lp.user_id IN (
            SELECT id FROM users
            WHERE auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
          )
        )
      );

    CREATE POLICY tasks_delete_own_plan ON tasks
      FOR DELETE
      TO authenticated
      USING (
        module_id IN (
          SELECT m.id
          FROM modules m
          JOIN learning_plans lp ON lp.id = m.plan_id
          WHERE lp.user_id IN (
            SELECT id FROM users
            WHERE auth_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
          )
        )
      );
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

// Cache table removed – no-op helper deleted

export async function ensureUser({
  authUserId,
  email,
  name,
  subscriptionTier,
}: {
  authUserId: string;
  email: string;
  name?: string;
  subscriptionTier?: 'free' | 'starter' | 'pro';
}): Promise<string> {
  // Try to find existing user first
  const existing = await db.query.users.findFirst({
    where: (fields, operators) => operators.eq(fields.authUserId, authUserId),
  });

  if (existing) {
    // If tier is specified and different from existing, update it
    if (subscriptionTier && existing.subscriptionTier !== subscriptionTier) {
      await db
        .update(users)
        .set({ subscriptionTier })
        .where(eq(users.id, existing.id));
    }
    return existing.id;
  }

  // User doesn't exist, create it
  const [inserted] = await db
    .insert(users)
    .values({
      authUserId,
      email,
      name: name ?? email,
      ...(subscriptionTier && { subscriptionTier }),
    })
    .returning({ id: users.id });

  if (!inserted?.id) {
    throw new Error(`Failed to create user for ${authUserId}`);
  }

  return inserted.id;
}
