import { AUTHENTICATED_SERVER_OWNED_WRITE_TABLES } from '../../../supabase/privileges/authenticated-table-privileges';
import { TASK_PROGRESS_AUTHENTICATED_UPDATE_COLUMNS } from '../../../supabase/privileges/task-progress-authenticated-update-columns';
import {
  USER_EMAIL_NOTIFICATION_PREFERENCES_AUTHENTICATED_INSERT_COLUMNS,
  USER_EMAIL_NOTIFICATION_PREFERENCES_AUTHENTICATED_UPDATE_COLUMNS,
  USER_EMAIL_NOTIFICATION_SETTINGS_AUTHENTICATED_INSERT_COLUMNS,
  USER_EMAIL_NOTIFICATION_SETTINGS_AUTHENTICATED_UPDATE_COLUMNS,
  USER_PREFERENCES_AUTHENTICATED_INSERT_COLUMNS,
  USER_PREFERENCES_AUTHENTICATED_UPDATE_COLUMNS,
} from '../../../supabase/privileges/user-preferences-authenticated-columns';
import { USERS_AUTHENTICATED_UPDATE_COLUMNS } from '../../../supabase/privileges/users-authenticated-update-columns';
import { AUTH_JWT_BOOTSTRAP_SQL } from '../sql/auth-jwt-bootstrap';
/**
 * Shared Supabase-like bootstrap for isolated Testcontainers Postgres and
 * the opt-in native Supabase test stack.
 * Keep in sync with migration + privilege rules.
 */
import postgres from 'postgres';

/**
 * Bootstrap a freshly-started Postgres instance with the roles, extensions,
 * and functions that the application schema and RLS policies expect.
 */
export async function bootstrapDatabase(connectionUrl: string): Promise<void> {
  const sql = postgres(connectionUrl, { max: 1 });

  try {
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;

    await sql.unsafe(`
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOINHERIT NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await sql`CREATE SCHEMA IF NOT EXISTS auth`;
    await sql.unsafe(AUTH_JWT_BOOTSTRAP_SQL);

    await sql`GRANT USAGE ON SCHEMA public TO authenticated, anon`;
    await sql`GRANT USAGE ON SCHEMA auth TO authenticated, anon`;
  } finally {
    await sql.end();
  }
}

const PG_CRON_SHADOW_SCHEMA = 'atlaris_test_pg_cron_shadow';

/**
 * Run `applyMigrations` with pg_cron hidden from `pg_available_extensions`
 * when pg_cron is available but cannot be created in this database.
 *
 * Supabase images (Docker and native) make pg_cron available but only
 * creatable in `cron.database_name` (`postgres`). The retention migration
 * creates it whenever it is available, so it fails in `atlaris_test_*`
 * databases (JCS-124 F6). For the migration only, this database's
 * search_path for the connecting role puts a filtered view ahead of
 * pg_catalog, so the migration skips scheduling exactly as it does on
 * postgres:17-alpine, where pg_cron is unavailable and this is a no-op.
 * The stack's own `postgres` database keeps pg_cron.
 */
export async function withUnschedulablePgCronHidden(
  connectionUrl: string,
  applyMigrations: () => void | Promise<void>,
): Promise<void> {
  if (!(await isPgCronUnschedulableHere(connectionUrl))) {
    await applyMigrations();
    return;
  }

  await runStatements(
    connectionUrl,
    `
    CREATE SCHEMA ${PG_CRON_SHADOW_SCHEMA};
    CREATE VIEW ${PG_CRON_SHADOW_SCHEMA}.pg_available_extensions AS
      SELECT * FROM pg_catalog.pg_available_extensions WHERE name <> 'pg_cron';
    DO $$ BEGIN
      EXECUTE format(
        'ALTER ROLE CURRENT_USER IN DATABASE %I SET search_path = "$user", public, ${PG_CRON_SHADOW_SCHEMA}, pg_catalog, extensions',
        current_database()
      );
    END $$;
  `,
  );

  try {
    await applyMigrations();
  } finally {
    await runStatements(
      connectionUrl,
      `
      DO $$ BEGIN
        EXECUTE format(
          'ALTER ROLE CURRENT_USER IN DATABASE %I RESET search_path',
          current_database()
        );
      END $$;
      DROP VIEW ${PG_CRON_SHADOW_SCHEMA}.pg_available_extensions;
      DROP SCHEMA ${PG_CRON_SHADOW_SCHEMA};
    `,
    );
  }
}

async function isPgCronUnschedulableHere(
  connectionUrl: string,
): Promise<boolean> {
  const sql = postgres(connectionUrl, { max: 1 });

  try {
    const rows = await sql<{ unschedulable: boolean }[]>`
      select exists (
          select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron'
        )
        and current_database() is distinct from
          current_setting('cron.database_name', true) as unschedulable
    `;
    return rows[0]?.unschedulable ?? false;
  } finally {
    await sql.end();
  }
}

async function runStatements(
  connectionUrl: string,
  statements: string,
): Promise<void> {
  const sql = postgres(connectionUrl, { max: 1 });

  try {
    await sql.unsafe(statements);
  } finally {
    await sql.end();
  }
}

/**
 * Grant permissions required for RLS roles after schema has been applied
 * (tables now exist).
 */
export async function grantRlsPermissions(
  connectionUrl: string,
): Promise<void> {
  const sql = postgres(connectionUrl, { max: 1 });

  try {
    await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated`;
    await sql`GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon`;
    await sql`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon`;

    const serverOwnedTablesSql = AUTHENTICATED_SERVER_OWNED_WRITE_TABLES.map(
      (table) => `"${table}"`,
    ).join(', ');

    await sql.unsafe(`
      REVOKE INSERT ON "users" FROM authenticated;
      REVOKE UPDATE ON "users" FROM authenticated;
      GRANT UPDATE (${USERS_AUTHENTICATED_UPDATE_COLUMNS.join(', ')}) ON "users" TO authenticated;
      REVOKE DELETE ON "users" FROM authenticated;
      REVOKE INSERT, UPDATE, DELETE ON "user_preferences" FROM authenticated;
      GRANT INSERT (${USER_PREFERENCES_AUTHENTICATED_INSERT_COLUMNS.join(', ')}) ON "user_preferences" TO authenticated;
      GRANT UPDATE (${USER_PREFERENCES_AUTHENTICATED_UPDATE_COLUMNS.join(', ')}) ON "user_preferences" TO authenticated;
      REVOKE INSERT, UPDATE, DELETE ON "user_email_notification_settings" FROM authenticated;
      GRANT INSERT (${USER_EMAIL_NOTIFICATION_SETTINGS_AUTHENTICATED_INSERT_COLUMNS.join(', ')}) ON "user_email_notification_settings" TO authenticated;
      GRANT UPDATE (${USER_EMAIL_NOTIFICATION_SETTINGS_AUTHENTICATED_UPDATE_COLUMNS.join(', ')}) ON "user_email_notification_settings" TO authenticated;
      REVOKE INSERT, UPDATE, DELETE ON "user_email_notification_preferences" FROM authenticated;
      GRANT INSERT (${USER_EMAIL_NOTIFICATION_PREFERENCES_AUTHENTICATED_INSERT_COLUMNS.join(', ')}) ON "user_email_notification_preferences" TO authenticated;
      GRANT UPDATE (${USER_EMAIL_NOTIFICATION_PREFERENCES_AUTHENTICATED_UPDATE_COLUMNS.join(', ')}) ON "user_email_notification_preferences" TO authenticated;
      REVOKE ALL ON "user_preferences", "user_email_notification_settings", "user_email_notification_preferences", "clerk_webhook_events", "clerk_webhook_event_claims", "email_notification_delivery_runs", "email_notification_deliveries" FROM anon;
      REVOKE ALL ON "clerk_webhook_events", "clerk_webhook_event_claims", "email_notification_delivery_runs", "email_notification_deliveries" FROM authenticated;
      REVOKE INSERT, UPDATE, DELETE ON "job_queue" FROM authenticated;
      REVOKE INSERT, UPDATE, DELETE ON "job_queue" FROM anon;
      REVOKE INSERT, UPDATE, DELETE ON ${serverOwnedTablesSql} FROM authenticated;
      GRANT INSERT ON "task_progress" TO authenticated;
      REVOKE UPDATE ON "task_progress" FROM authenticated;
      GRANT UPDATE (${TASK_PROGRESS_AUTHENTICATED_UPDATE_COLUMNS.join(', ')}) ON "task_progress" TO authenticated;
      REVOKE DELETE ON "task_progress" FROM authenticated;
    `);

    const updateColumnGrants = await sql<{ column_name: string }[]>`
      select column_name::text
      from information_schema.column_privileges
      where table_schema = 'public'
        and table_name = 'users'
        and grantee = 'authenticated'
        and privilege_type = 'UPDATE'
      order by column_name
    `;
    const grantedSorted = updateColumnGrants.map((r) => r.column_name);
    const expectedSorted = [...USERS_AUTHENTICATED_UPDATE_COLUMNS].sort();
    if (
      grantedSorted.length !== expectedSorted.length ||
      grantedSorted.some((c, i) => c !== expectedSorted[i])
    ) {
      throw new Error(
        `Bootstrap: authenticated UPDATE columns on public.users expected [${expectedSorted.join(', ')}], got [${grantedSorted.join(', ')}]. Sync grantRlsPermissions with the final users UPDATE grant and supabase/privileges/users-authenticated-update-columns.ts.`,
      );
    }

    const jobQueueWriteGrants = await sql<
      { grantee: string; privilege_type: string }[]
    >`
      select grantee::text, privilege_type::text
      from information_schema.table_privileges
      where table_schema = 'public'
        and table_name = 'job_queue'
        and grantee in ('authenticated', 'anon')
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
      order by grantee, privilege_type
    `;
    if (jobQueueWriteGrants.length > 0) {
      const got = jobQueueWriteGrants
        .map((r) => `${r.grantee}:${r.privilege_type}`)
        .join(', ');
      throw new Error(
        `Bootstrap: job_queue write grants for authenticated/anon expected [], got [${got}]. Sync grantRlsPermissions with supabase/migrations/0028_harden_job_queue_service_role_writes.sql and 0029_harden_job_queue_anonymous.sql.`,
      );
    }

    const serverOwnedWriteGrants = await sql<
      { table_name: string; privilege_type: string }[]
    >`
      select table_name::text, privilege_type::text
      from information_schema.table_privileges
      where table_schema = 'public'
        and table_name = any(${AUTHENTICATED_SERVER_OWNED_WRITE_TABLES})
        and grantee = 'authenticated'
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
      order by table_name, privilege_type
    `;
    if (serverOwnedWriteGrants.length > 0) {
      const got = serverOwnedWriteGrants
        .map((r) => `${r.table_name}:${r.privilege_type}`)
        .join(', ');
      throw new Error(
        `Bootstrap: server-owned write grants for authenticated expected [], got [${got}]. Sync grantRlsPermissions with supabase/migrations/20260520194501_harden_authenticated_server_owned_writes.sql and supabase/privileges/authenticated-table-privileges.ts.`,
      );
    }

    await sql`
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        REVOKE INSERT, UPDATE, DELETE ON TABLES FROM authenticated
    `;
    await sql`
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT ON TABLES TO authenticated
    `;
    await sql`
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT ON TABLES TO anon
    `;
    await sql`
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO authenticated, anon
    `;

    // postgres:17-alpine needs this. Supabase images already grant BYPASSRLS
    // to their non-superuser postgres role and refuse to alter it (JCS-124 F7).
    const postgresRole = await sql<{ rolbypassrls: boolean }[]>`
      select rolbypassrls from pg_roles where rolname = 'postgres'
    `;
    if (!postgresRole[0]?.rolbypassrls) {
      await sql`ALTER ROLE postgres BYPASSRLS`;
    }
  } finally {
    await sql.end();
  }
}
