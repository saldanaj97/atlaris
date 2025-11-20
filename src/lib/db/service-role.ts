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
import postgres from 'postgres';

import * as schema from './schema';

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

// Use non-pooling connection in tests to avoid pooler issues
const isTest =
  typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
const dbUrl =
  isTest && databaseEnv.nonPoolingUrl
    ? databaseEnv.nonPoolingUrl
    : databaseEnv.url;

export const client = postgres(dbUrl, {
  max: 10, // Connection pool size for service-role client
  idle_timeout: 20,
  connect_timeout: 10,
});

/**
 * Service role database client - BYPASSES RLS
 *
 * ⚠️ This export is intentionally named to make it obvious it's dangerous.
 * Use getDb() from @/lib/db/runtime in request handlers instead.
 */
export const serviceRoleDb = drizzle(client, { schema });

/**
 * Shorter alias for serviceRoleDb.
 * Both names are equally valid - use whichever is clearer in context.
 */
export const db = serviceRoleDb;
