import {
  getPostgresHostname,
  isLocalPostgresHostname,
} from './local-postgres-host';
import { seedLocalProductTestingUser } from '@tests/helpers/db/seed-local-product-testing';
/**
 * Seed the Supabase local database with deterministic product-testing data.
 * Refuses non-localhost POSTGRES_URL to avoid accidental writes to hosted databases.
 *
 * `supabase db reset` also applies `supabase/seed.sql`; this helper exists for
 * explicit reseeding via `pnpm db:dev:seed`.
 */
import dotenv from 'dotenv';
import postgres from 'postgres';

const DEFAULT_LOCAL_SUPABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Resolves the Postgres connection URL from env or the local Supabase default. */
function resolveDatabaseUrl(): string {
  return process.env.POSTGRES_URL?.trim() || DEFAULT_LOCAL_SUPABASE_URL;
}

/** Throws when the connection URL targets a non-localhost host. */
function assertLocalhostOnly(connectionUrl: string): void {
  const hostname = getPostgresHostname(connectionUrl);
  if (hostname === null) {
    throw new Error(
      'Invalid POSTGRES_URL: could not parse hostname (expected a postgresql:// URL).',
    );
  }

  if (!isLocalPostgresHostname(hostname)) {
    throw new Error(
      `Refusing to seed non-local database (host: ${hostname}). This script is for Supabase local dev only.`,
    );
  }
}

/** Verifies the database is reachable before seeding. */
async function assertConnection(connectionUrl: string): Promise<void> {
  const sql = postgres(connectionUrl, { max: 1 });
  try {
    await sql`SELECT 1`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not connect to Supabase local Postgres. Is Supabase running? (${message})`,
      { cause: err },
    );
  } finally {
    await sql.end();
  }
}

/** Loads env, validates localhost, and seeds local product-testing data. */
async function main(): Promise<void> {
  if (!process.env.CI) {
    dotenv.config({ path: '.env.local' });
  }

  const databaseUrl = resolveDatabaseUrl();
  assertLocalhostOnly(databaseUrl);

  console.log('[seed-local-supabase] Testing connection...');
  await assertConnection(databaseUrl);

  console.log('[seed-local-supabase] Seeding local product-testing data...');
  await seedLocalProductTestingUser(databaseUrl);

  console.log('[seed-local-supabase] Done.');
  console.log(`[seed-local-supabase] POSTGRES_URL=${databaseUrl}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
