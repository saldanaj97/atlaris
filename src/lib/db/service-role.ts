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
 * ✅ Test setup and seeding (tests/helpers/db.ts, tests/.../setup.ts)
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

import { databaseEnv } from '@/lib/config/env';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import * as schema from './schema';

type ServiceRoleDb = Awaited<ReturnType<typeof drizzle<typeof schema>>>;

// ============================================================================
// SERVICE ROLE CLIENT - RLS BYPASSED
// ============================================================================
//
// This client connects as the database owner with BYPASSRLS privilege.
// It does NOT set session variables and does NOT enforce RLS policies.
//
// Architecture notes:
// - Uses owner role which has rolbypassrls = true
// - RLS policies are bypassed for this role (BYPASSRLS privilege)
// - All data is accessible regardless of user_id
// - No tenant isolation - can read/write ALL users' data
//
// This is intentional for:
// - Workers that need cross-tenant operations
// - Migrations that modify schema
// - Test setup that creates data for multiple users
//
// See @/lib/db/rls.ts for RLS-enforced client implementation.
// ============================================================================

// ============================================================================
// LAZY INITIALIZATION - ONLY CONNECTS WHEN ACCESSED
// ============================================================================
//
// Previously, the postgres client was initialized at module scope (top-level),
// which required DATABASE_URL to be present at build time. Next.js imports
// API routes during the build process to analyze them, which would trigger
// the initialization and fail if DATABASE_URL was missing.
//
// This lazy initialization defers the database connection to the first
// time it's actually accessed, allowing builds to succeed without DATABASE_URL.
// The connection is then reused for the lifetime of the process.

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

/**
 * Postgres client - lazily initialized on first access.
 *
 * This Proxy wraps the actual client to defer initialization until first use.
 * This allows the module to be imported at build time without requiring
 * DATABASE_URL to be present.
 *
 * ⚠️ DATABASE_URL will be required when the client is first accessed,
 * not when this module is imported.
 */

export const client = new Proxy(
  {},
  {
    get(_target, prop: string | symbol): unknown {
      const actualClient = initializeClient();

      return (actualClient as unknown as Record<string | symbol, unknown>)[
        prop
      ];
    },
  }
) as Sql;

/**
 * Service role database client - BYPASSES RLS (lazily initialized)
 *
 * ⚠️ This export is intentionally named to make it obvious it's dangerous.
 * Use getDb() from @/lib/db/runtime in request handlers instead.
 *
 * Initialization is deferred until first access, allowing builds without
 * DATABASE_URL.
 */
export const serviceRoleDb = new Proxy(
  {},
  {
    get(_target, prop: string | symbol): unknown {
      const actualDb = initializeDb();

      return (actualDb as unknown as Record<string | symbol, unknown>)[prop];
    },
  }
  // Cast the proxy to the concrete Drizzle client type
) as ServiceRoleDb;

/**
 * Shorter alias for serviceRoleDb.
 * Both names are equally valid - use whichever is clearer in context.
 */
export const db: ServiceRoleDb = serviceRoleDb;

/**
 * Check if the database client has been initialized.
 * Useful for conditional cleanup in tests and workers.
 *
 * @returns true if the client has been initialized, false otherwise
 */
export function isClientInitialized(): boolean {
  return _client !== null;
}
