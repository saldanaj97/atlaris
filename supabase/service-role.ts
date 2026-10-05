/**
 * ⚠️ ⚠️ ⚠️ DANGER: SERVICE ROLE CLIENT - BYPASSES RLS ⚠️ ⚠️ ⚠️
 *
 * This client BYPASSES Row Level Security completely!
 * Using this in the wrong context creates critical security vulnerabilities.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * USE FOR (trusted server-owned writes):
 * ═══════════════════════════════════════════════════════════════════════
 * ✅ Workers and background jobs (src/workers/...)
 * ✅ Database migrations and schema changes
 * ✅ Test setup and seeding (tests/helpers/db/, tests/.../setup.ts)
 * ✅ Administrative scripts (scripts/...)
 * ✅ Feature-owned server write boundaries after request auth + ownership
 *    checks (billing meters, generation/cache persistence, plan deletion)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * DO NOT USE DIRECTLY IN:
 * ═══════════════════════════════════════════════════════════════════════
 * ❌ Raw API route handlers (src/app/api/...)
 * ❌ Server actions (src/app/.../actions.ts)
 * ❌ Request-handler glue (src/lib/api/...)
 * ❌ Arbitrary user-request code paths without a narrow write boundary
 *
 * Route/action layers should use getDb() for reads and access checks, then
 * delegate server-owned mutations to a feature service that receives this
 * client only after verifying the actor and row ownership.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FOR REQUEST-SCOPED READS AND ACCESS CHECKS:
 * ═══════════════════════════════════════════════════════════════════════
 * Use getDb() from @supabase/runtime — it returns the RLS-enforced client
 * for the active request context.
 *
 * Or import RLS clients directly from @/lib/db:
 * import { createAuthenticatedRlsClient } from '@/lib/db';
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SECURITY:
 * ═══════════════════════════════════════════════════════════════════════
 * ESLint rules block imports of this file in request layers.
 * If you're seeing an ESLint error, you're using the wrong client!
 */

import type { DbClient } from '@/lib/db/types';

import * as schema from './schema';
import { databaseEnv } from '@/lib/config/env';
import { drizzle } from 'drizzle-orm/postgres-js';
import { AsyncLocalStorage } from 'node:async_hooks';
import postgres, { type Sql } from 'postgres';

type ServiceRoleDb = Awaited<ReturnType<typeof drizzle<typeof schema>>>;

// SERVICE ROLE CLIENT — BYPASSES RLS.
// Connects as the DB owner (BYPASSRLS), so policies are not enforced and there is
// no tenant isolation. Reserved for workers doing cross-tenant work, schema
// migrations, and test setup that spans multiple users.
// See @supabase/rls for the RLS-enforced client.
//
// Lazy init: postgres client + drizzle are constructed on first access so Next.js
// build-time imports of API routes don't require POSTGRES_URL to be present.
//
// Scoped provider: the jobs Worker cannot share I/O across invocations, so it
// runs each invocation inside runWithServiceRoleDb() with its own client, and
// `db` resolves to that client there. Outside a scope `db` is the singleton.

let _client: Sql | null = null;
let _db: ServiceRoleDb | null = null;

/**
 * Initialize the postgres client if not already initialized.
 * Uses non-pooling connection in tests to avoid pooler issues.
 */
function initializeClient(): Sql {
  if (_client === null) {
    const isTest = process.env.NODE_ENV === 'test';
    const dbUrl =
      isTest && databaseEnv.nonPoolingUrl
        ? databaseEnv.nonPoolingUrl
        : databaseEnv.url;

    _client = postgres(dbUrl, {
      max: 10, // Connection pool size for service-role client
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }

  return _client;
}

/**
 * Initialize the Drizzle client if not already initialized.
 */
function initializeDb(): ServiceRoleDb {
  if (_db === null) {
    _db = drizzle(initializeClient(), { schema });
  }

  return _db;
}

const scopedServiceRoleDb = new AsyncLocalStorage<DbClient>();

/**
 * Runs `fn` with `db` resolving to `client` (the jobs Worker's per-invocation
 * service-role client) for every call made inside it.
 */
export function runWithServiceRoleDb<T>(client: DbClient, fn: () => T): T {
  return scopedServiceRoleDb.run(client, fn);
}

function resolveServiceRoleDb(): DbClient {
  return scopedServiceRoleDb.getStore() ?? initializeDb();
}

/** Recognized by RLS helpers so `=== serviceDb` is not the only bypass signal. */
export const SERVICE_ROLE_DB_MARKER = Symbol.for('atlaris.serviceRoleDb');

const serviceRoleProxyTarget: Record<PropertyKey, unknown> = {
  [SERVICE_ROLE_DB_MARKER]: true,
};

export function isServiceRoleDbClient(client: unknown): boolean {
  return (
    typeof client === 'object' &&
    client !== null &&
    Reflect.get(client, SERVICE_ROLE_DB_MARKER) === true
  );
}

/**
 * Service role database client - BYPASSES RLS (lazily initialized, or the
 * scoped client inside runWithServiceRoleDb()).
 * Prefer getDb() in route/action layers; pass this client only through
 * feature-owned server write boundaries for server-owned tables.
 */
export const db: DbClient = new Proxy(
  serviceRoleProxyTarget,
  {
    get(target, prop: string | symbol, receiver): unknown {
      if (prop === SERVICE_ROLE_DB_MARKER) {
        return Reflect.get(target, prop, receiver);
      }
      return Reflect.get(resolveServiceRoleDb(), prop);
    },
  },
  // Cast the proxy to the driver-neutral Drizzle client type
) as unknown as DbClient;

/**
 * Check if the database client has been initialized.
 * Useful for conditional cleanup in tests and workers.
 *
 * @returns true if the client has been initialized, false otherwise
 */
export function isClientInitialized(): boolean {
  return _client !== null;
}

/**
 * Test-only escape hatch to clear the cached client after setup swaps DB URLs.
 * Throws in production to prevent accidental misuse closing the live pool.
 */
export async function resetServiceRoleClientForTests(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'resetServiceRoleClientForTests is test-only and must not run in production.',
    );
  }

  const clientToClose = _client;
  _db = null;
  _client = null;

  if (clientToClose) {
    await clientToClose.end();
  }
}
