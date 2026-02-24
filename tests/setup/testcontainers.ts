/**
 * Vitest globalSetup: spins up a PostgreSQL Testcontainer before any
 * integration / e2e / security tests and tears it down when they finish.
 *
 * The container:
 *   - Uses Postgres 17 (matching docker-compose.test.yml)
 *   - Creates a test database with extensions and RLS roles
 *   - Sets DATABASE_URL / DATABASE_URL_NON_POOLING so the service-role
 *     client and drizzle-kit connect to the ephemeral instance
 *   - Applies the schema via `drizzle-kit push` (same as the old shell script)
 *
 * To skip Testcontainers (e.g. in CI where a sidecar DB already exists)
 * set SKIP_TESTCONTAINERS=true.
 */

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

let container: StartedPostgreSqlContainer | null = null;
const testDbPassword = randomUUID();

/**
 * Path to the temp file used to pass the container connection URL
 * from globalSetup (main process) to test workers.
 */
const TC_ENV_FILE = join(__dirname, '..', '.testcontainers-env.json');

/**
 * Bootstrap a freshly-started Postgres instance with the roles, extensions,
 * and functions that the application schema and RLS policies expect.
 */
async function bootstrapDatabase(connectionUrl: string): Promise<void> {
  const sql = postgres(connectionUrl, { max: 1 });

  try {
    // Extensions
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;

    // RLS roles (union of CI and local expectations)
    await sql.unsafe(`
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE anonymous NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOINHERIT NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE neondb_owner NOINHERIT NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // Auth schema + JWT helper used by RLS policies
    await sql`CREATE SCHEMA IF NOT EXISTS auth`;
    await sql.unsafe(`
      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
        LANGUAGE sql
        AS $fn$ SELECT COALESCE(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb) $fn$;
    `);

    // Grant schema access to RLS roles
    await sql.unsafe(`
      GRANT USAGE ON SCHEMA public TO authenticated, anonymous;
      GRANT USAGE ON SCHEMA auth TO authenticated, anonymous;
    `);
  } finally {
    await sql.end();
  }
}

/**
 * Apply the Drizzle schema to the running Postgres instance using `drizzle-kit push`.
 * Uses --force to auto-approve data-loss statements (safe for ephemeral test DB).
 */
function applySchema(connectionUrl: string): void {
  execSync('pnpm drizzle-kit push --force --config drizzle.config.ts', {
    stdio: 'pipe',
    env: {
      ...process.env,
      DATABASE_URL: connectionUrl,
      DATABASE_URL_NON_POOLING: connectionUrl,
      DATABASE_URL_UNPOOLED: connectionUrl,
      NODE_ENV: 'test',
    },
  });
}

/**
 * Grant permissions required for RLS roles after schema has been applied
 * (tables now exist).
 */
async function grantRlsPermissions(connectionUrl: string): Promise<void> {
  const sql = postgres(connectionUrl, { max: 1 });

  try {
    // Table permissions for authenticated role
    await sql.unsafe(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO anonymous;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anonymous;
    `);

    // Default privileges for future tables
    await sql.unsafe(`
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT ON TABLES TO anonymous;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO authenticated, anonymous;
    `);

    // Ensure the default superuser bypasses RLS
    await sql.unsafe(`ALTER ROLE postgres BYPASSRLS`);
  } finally {
    await sql.end();
  }
}

export async function setup(): Promise<void> {
  if (process.env.SKIP_TESTCONTAINERS === 'true') {
    console.log('[Testcontainers] Skipped — SKIP_TESTCONTAINERS=true');
    return;
  }

  console.log('[Testcontainers] Starting PostgreSQL 17 container…');

  container = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('atlaris_test')
    .withUsername('postgres')
    .withPassword(testDbPassword)
    .withExposedPorts(5432)
    .start();

  const connectionUrl = container.getConnectionUri();

  console.log('[Testcontainers] Container started, bootstrapping database…');

  await bootstrapDatabase(connectionUrl);

  console.log('[Testcontainers] Applying schema via drizzle-kit push…');

  applySchema(connectionUrl);

  console.log('[Testcontainers] Granting RLS permissions…');

  await grantRlsPermissions(connectionUrl);

  // Expose connection URL to all test workers via env vars.
  // Vitest globalSetup env mutations are inherited by worker processes.
  process.env.DATABASE_URL = connectionUrl;
  process.env.DATABASE_URL_NON_POOLING = connectionUrl;
  process.env.DATABASE_URL_UNPOOLED = connectionUrl;
  process.env.ALLOW_DB_TRUNCATE = 'true';

  // Write env to a temp file for cross-process propagation.
  // setupFiles (test-env.ts) can read this when process.env wasn't inherited.
  writeFileSync(
    TC_ENV_FILE,
    JSON.stringify({
      DATABASE_URL: connectionUrl,
      DATABASE_URL_NON_POOLING: connectionUrl,
      DATABASE_URL_UNPOOLED: connectionUrl,
      ALLOW_DB_TRUNCATE: 'true',
    })
  );

  console.log('[Testcontainers] Ready ✓');
}

export async function teardown(): Promise<void> {
  // Clean up the temp env file
  try {
    unlinkSync(TC_ENV_FILE);
  } catch {
    // File may not exist if setup was skipped
  }

  if (container) {
    console.log('[Testcontainers] Stopping container…');
    await container.stop();
    container = null;
    console.log('[Testcontainers] Stopped ✓');
  }
}
