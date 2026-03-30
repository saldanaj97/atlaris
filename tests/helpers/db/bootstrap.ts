/**
 * Shared Neon-like bootstrap for Postgres used by Testcontainers and
 * `scripts/bootstrap-local-db.ts`. Keep in sync with migration + privilege rules.
 */
import postgres from 'postgres';

import { USERS_AUTHENTICATED_UPDATE_COLUMNS } from '@/lib/db/privileges/users-authenticated-update-columns';

import { AUTH_JWT_BOOTSTRAP_SQL } from '../sql/auth-jwt-bootstrap';

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
      DO $$ BEGIN CREATE ROLE anonymous NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOINHERIT NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE neondb_owner NOINHERIT NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await sql`CREATE SCHEMA IF NOT EXISTS auth`;
    await sql.unsafe(AUTH_JWT_BOOTSTRAP_SQL);

    await sql`GRANT USAGE ON SCHEMA public TO authenticated, anonymous`;
    await sql`GRANT USAGE ON SCHEMA auth TO authenticated, anonymous`;
  } finally {
    await sql.end();
  }
}

/**
 * Grant permissions required for RLS roles after schema has been applied
 * (tables now exist).
 */
export async function grantRlsPermissions(
  connectionUrl: string
): Promise<void> {
  const sql = postgres(connectionUrl, { max: 1 });

  try {
    await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated`;
    await sql`GRANT SELECT ON ALL TABLES IN SCHEMA public TO anonymous`;
    await sql`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anonymous`;

    await sql.unsafe(`
      REVOKE UPDATE ON "users" FROM authenticated;
      GRANT UPDATE (${USERS_AUTHENTICATED_UPDATE_COLUMNS.join(', ')}) ON "users" TO authenticated;
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
        `Bootstrap: authenticated UPDATE columns on public.users expected [${expectedSorted.join(', ')}], got [${grantedSorted.join(', ')}]. Sync grantRlsPermissions with src/lib/db/migrations/0018_harden_users_update_columns.sql and src/lib/db/privileges/users-authenticated-update-columns.ts.`
      );
    }

    await sql`
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated
    `;
    await sql`
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT ON TABLES TO anonymous
    `;
    await sql`
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO authenticated, anonymous
    `;

    await sql`ALTER ROLE postgres BYPASSRLS`;
  } finally {
    await sql.end();
  }
}
