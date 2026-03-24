import { sql } from 'drizzle-orm';

import { USERS_AUTHENTICATED_UPDATE_COLUMNS_SQL } from '@/lib/db/privileges/users-authenticated-update-columns';
import { db } from '@/lib/db/service-role';

import { AUTH_JWT_BOOTSTRAP_SQL } from '../sql/auth-jwt-bootstrap';

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

  await db.execute(sql.raw(AUTH_JWT_BOOTSTRAP_SQL)); // see tests/helpers/sql/auth-jwt-bootstrap.ts

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

  // Restrict authenticated role to user-editable columns on users table.
  // Matches migration 0018 and @/lib/db/privileges/users-authenticated-update-columns.
  await db.execute(sql`
    REVOKE UPDATE ON "users" FROM authenticated;
    GRANT UPDATE (${sql.raw(USERS_AUTHENTICATED_UPDATE_COLUMNS_SQL)}) ON "users" TO authenticated;
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
