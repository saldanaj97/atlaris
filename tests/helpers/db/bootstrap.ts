import { AUTHENTICATED_SERVER_OWNED_WRITE_TABLES } from '../../../supabase/privileges/authenticated-table-privileges';
import { USERS_AUTHENTICATED_UPDATE_COLUMNS } from '../../../supabase/privileges/users-authenticated-update-columns';
import { AUTH_JWT_BOOTSTRAP_SQL } from '../sql/auth-jwt-bootstrap';
/**
 * Shared Supabase-like bootstrap for isolated Testcontainers Postgres.
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
      REVOKE UPDATE ON "users" FROM authenticated;
      GRANT UPDATE (${USERS_AUTHENTICATED_UPDATE_COLUMNS.join(', ')}) ON "users" TO authenticated;
      REVOKE DELETE ON "users" FROM authenticated;
      REVOKE INSERT, UPDATE, DELETE ON "job_queue" FROM authenticated;
      REVOKE INSERT, UPDATE, DELETE ON "job_queue" FROM anon;
      REVOKE INSERT, UPDATE, DELETE ON ${serverOwnedTablesSql} FROM authenticated;
      GRANT INSERT, UPDATE, DELETE ON "task_progress" TO authenticated;
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
        `Bootstrap: authenticated UPDATE columns on public.users expected [${expectedSorted.join(', ')}], got [${grantedSorted.join(', ')}]. Sync grantRlsPermissions with supabase/migrations/0018_harden_users_update_columns.sql and supabase/privileges/users-authenticated-update-columns.ts.`,
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

    await sql`ALTER ROLE postgres BYPASSRLS`;
  } finally {
    await sql.end();
  }
}
