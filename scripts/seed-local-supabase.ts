/**
 * Seed the Supabase local database with the deterministic product-testing user.
 * Refuses non-localhost DATABASE_URL to avoid accidental writes to hosted databases.
 *
 * `supabase db reset` also applies `supabase/seed.sql`; this helper exists for
 * explicit reseeding and the legacy `pnpm db:dev:bootstrap` alias.
 */
import dotenv from 'dotenv';
import postgres from 'postgres';

import { seedLocalProductTestingUser } from '@tests/helpers/db/seed-local-product-testing';

const DEFAULT_LOCAL_SUPABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function resolveDatabaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || DEFAULT_LOCAL_SUPABASE_URL;
}

function assertLocalhostOnly(connectionUrl: string): void {
  let url: URL;
  try {
    url = new URL(connectionUrl);
  } catch {
    throw new Error(
      'Invalid DATABASE_URL: could not parse hostname (expected a postgresql:// URL).',
    );
  }

  if (!LOCAL_HOSTNAMES.has(url.hostname)) {
    throw new Error(
      `Refusing to seed non-local database (host: ${url.hostname}). This script is for Supabase local dev only.`,
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
      `Could not connect to Supabase local Postgres. Is Supabase running? (${message})`,
      { cause: err },
    );
  } finally {
    await sql.end();
  }
}

async function main(): Promise<void> {
  if (!process.env.CI) {
    dotenv.config({ path: '.env.local' });
  }

  const databaseUrl = resolveDatabaseUrl();
  assertLocalhostOnly(databaseUrl);

  console.log('[seed-local-supabase] Testing connection...');
  await assertConnection(databaseUrl);

  console.log('[seed-local-supabase] Seeding local product-testing user...');
  await seedLocalProductTestingUser(databaseUrl);

  console.log('[seed-local-supabase] Done.');
  console.log(`[seed-local-supabase] DATABASE_URL=${databaseUrl}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
