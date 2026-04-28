/**
 * ⚠️ ⚠️ ⚠️ DANGER: SERVICE ROLE CLIENT - BYPASSES RLS ⚠️ ⚠️ ⚠️
 *
 * This client BYPASSES Row Level Security completely!
 * Using this in the wrong context creates critical security vulnerabilities.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ONLY USE FOR:
 * ═══════════════════════════════════════════════════════════════════════
 * ✅ Workers and background jobs (src/workers/...)
 * ✅ Database migrations and schema changes
 * ✅ Test setup and seeding (tests/helpers/db/, tests/.../setup.ts)
 * ✅ Administrative scripts (scripts/...)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * NEVER USE IN:
 * ═══════════════════════════════════════════════════════════════════════
 * ❌ API routes (src/app/api/...)
 * ❌ Server actions (src/app/.../actions.ts)
 * ❌ Request handlers (src/lib/api/...)
 * ❌ Any code that handles user requests
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FOR REQUEST HANDLERS:
 * ═══════════════════════════════════════════════════════════════════════
 * Use getDb() from @/lib/db/runtime instead - it automatically returns
 * the correct RLS-enforced client based on request context.
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

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { databaseEnv } from '@/lib/config/env';

import { configureLocalNeon } from './neon-config';
import * as schema from './schema';

// Configure Neon for local Docker development if enabled
configureLocalNeon();

type ServiceRoleDb = Awaited<ReturnType<typeof drizzle<typeof schema>>>;

// SERVICE ROLE CLIENT — BYPASSES RLS.
// Connects as the DB owner (BYPASSRLS), so policies are not enforced and there is
// no tenant isolation. Reserved for workers doing cross-tenant work, schema
// migrations, and test setup that spans multiple users.
// See @/lib/db/rls.ts for the RLS-enforced client.
//
// Lazy init: postgres client + drizzle are constructed on first access so Next.js
// build-time imports of API routes don't require DATABASE_URL to be present.

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

function getLazyProxyProperty<T extends object>(
  initialize: () => T,
  prop: string | symbol,
): unknown {
  return Reflect.get(initialize(), prop);
}

/**
 * Service role database client - BYPASSES RLS (lazily initialized).
 * Use getDb() from @/lib/db/runtime in request handlers instead.
 */
export const db: ServiceRoleDb = new Proxy(
  {},
  {
    get(_target, prop: string | symbol): unknown {
      return getLazyProxyProperty(initializeDb, prop);
    },
  },
  // Cast the proxy to the concrete Drizzle client type
) as ServiceRoleDb;

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
