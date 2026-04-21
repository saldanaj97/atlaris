/**
 * Bootstrap local Postgres (extensions, roles, auth.jwt, migrations, RLS grants).
 * Refuses non-localhost DATABASE_URL to avoid accidental runs against Neon/production.
 *
 * Usage: pnpm db:dev:bootstrap
 * Optional: DATABASE_URL=postgresql://... pnpm db:dev:bootstrap
 */
import { execSync } from 'node:child_process';

import dotenv from 'dotenv';
import postgres from 'postgres';

import {
    bootstrapDatabase,
    grantRlsPermissions,
} from '@tests/helpers/db/bootstrap';
import { seedLocalProductTestingUser } from '@tests/helpers/db/seed-local-product-testing';

const DEFAULT_LOCAL_URL =
  'postgresql://postgres:postgres@localhost:54331/atlaris_dev';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function resolveDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return DEFAULT_LOCAL_URL;
}

function assertLocalhostOnly(connectionUrl: string): void {
  let host: string;
  try {
    host = new URL(connectionUrl).hostname;
  } catch {
    throw new Error(
      'Invalid DATABASE_URL: could not parse hostname (expected a postgresql:// URL).'
    );
  }
  if (!LOCAL_HOSTNAMES.has(host)) {
    throw new Error(
      `Refusing to bootstrap non-local database (host: ${host}). This script is for local dev only.`
    );
  }
}

async function assertConnection(connectionUrl: string): Promise<void> {
  const sql = postgres(connectionUrl, { max: 1 });
  try {
    await sql`SELECT 1`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not connect to Postgres at the given DATABASE_URL. Is Postgres running? (${message})`
    );
  } finally {
    await sql.end();
  }
}

function runMigrations(connectionUrl: string): void {
  execSync('pnpm db:migrate', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: connectionUrl,
      DATABASE_URL_NON_POOLING: connectionUrl,
      DATABASE_URL_UNPOOLED: connectionUrl,
      NODE_ENV: 'development',
    },
  });
}

async function main(): Promise<void> {
  if (!process.env.CI) {
    dotenv.config({ path: '.env.local' });
  }

  const databaseUrl = resolveDatabaseUrl();
  assertLocalhostOnly(databaseUrl);

  console.log('[bootstrap-local-db] Testing connection…');
  await assertConnection(databaseUrl);

  console.log('[bootstrap-local-db] Running bootstrapDatabase…');
  await bootstrapDatabase(databaseUrl);

  console.log('[bootstrap-local-db] Running pnpm db:migrate…');
  runMigrations(databaseUrl);

  console.log('[bootstrap-local-db] Granting RLS permissions…');
  await grantRlsPermissions(databaseUrl);

  console.log('[bootstrap-local-db] Seeding local product-testing user…');
  await seedLocalProductTestingUser(databaseUrl);

  console.log('[bootstrap-local-db] Done.');
  console.log(`[bootstrap-local-db] DATABASE_URL=${databaseUrl}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
