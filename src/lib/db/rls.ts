/**
 * RLS-enforced Drizzle client for Neon
 *
 * This module provides RLS-enforced database clients using SET ROLE to switch
 * to non-privileged database roles, combined with session variables for access control.
 *
 * USAGE:
 * - Request handlers: Use createAuthenticatedRlsClient() with the user's Clerk ID
 * - Anonymous sessions: Use createAnonymousRlsClient() only for explicit public endpoints or RLS security tests
 * - Workers/background jobs: Use the service-role client from @/lib/db/service-role
 * - Tests: Use helper functions from tests/helpers/rls.ts
 *
 * CONNECTION LIFECYCLE:
 * - Each RLS client creates a dedicated postgres connection (non-pooled, max: 1)
 * - The cleanup() function MUST be called when done to close the connection
 * - In request handlers, cleanup is automatically called via withAuth() wrapper's finally block
 * - Cleanup is idempotent: safe to call multiple times without errors
 * - Connections have idle_timeout: 20s as a safety net if cleanup is missed
 * - Always use try/finally pattern to ensure cleanup is called even on errors
 *
 * NEON RLS ARCHITECTURE (SET ROLE + Session Variable Approach):
 * - Connect with DATABASE_URL (owner role with BYPASSRLS privilege)
 * - Use SET ROLE to switch to 'authenticated' or 'anonymous' roles (no BYPASSRLS)
 * - Set session variable request.jwt.claims using set_config() with parameterized values
 * - RLS policies (without FORCE) + roles without BYPASSRLS ensure policies are enforced
 *
 * CRITICAL: The owner role has BYPASSRLS privilege which bypasses regular RLS.
 * We use SET ROLE to switch to non-privileged roles that lack BYPASSRLS.
 * This allows a single connection pool while maintaining RLS security.
 * Note: In test environments, BYPASSRLS allows tests to access tables directly.
 */

import { databaseEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Result type for RLS client creation functions.
 * Includes the Drizzle client and a cleanup function to close the connection.
 */
export interface RlsClientResult {
  db: Awaited<ReturnType<typeof drizzle<typeof schema>>>;
  cleanup: () => Promise<void>;
}

/**
 * Creates an RLS-enforced database client for authenticated users.
 *
 * Uses SET ROLE to switch to the authenticated role, then sets session variables
 * to identify the user. RLS policies check both the role and session variable
 * to enforce user-specific access control.
 *
 * @param clerkUserId - The Clerk user ID for the authenticated user
 * @returns Promise resolving to RLS client result with database client and cleanup function
 *
 * @example
 * ```typescript
 * // In an API route handler
 * const userId = await getEffectiveClerkUserId();
 * const { db: rlsDb, cleanup } = await createAuthenticatedRlsClient(userId);
 * try {
 *   const plans = await rlsDb.select().from(learningPlans);
 *   // Only returns plans owned by this user
 * } finally {
 *   await cleanup(); // Close connection when done
 * }
 * ```
 */
export async function createAuthenticatedRlsClient(
  clerkUserId: string
): Promise<RlsClientResult> {
  const jwtClaims = JSON.stringify({ sub: clerkUserId });

  // Connect with owner role using non-pooling connection (SET ROLE incompatible with poolers)
  // IMPORTANT: The owner role has BYPASSRLS privilege which bypasses RLS policies.
  // We use SET ROLE to switch to authenticated role which lacks BYPASSRLS.
  // Must use non-pooling connection because poolers may not handle SET ROLE correctly.
  const connectionUrl = databaseEnv.nonPoolingUrl || databaseEnv.url;
  const sql: Sql = postgres(connectionUrl, {
    max: 1, // Single connection per client (important for session variable isolation)
    idle_timeout: 20, // Close idle connections after 20s
    connect_timeout: 10, // Timeout for connection attempts
  });

  // Switch to authenticated role (without BYPASSRLS privilege)
  // CRITICAL: Must await to ensure role is switched before setting session variable
  await sql.unsafe('SET ROLE authenticated');

  // Set search_path after SET ROLE (role switch may reset it)
  await sql.unsafe('SET search_path = public');

  // Set session variable with user's Clerk ID using set_config for safety
  // CRITICAL: Must await to ensure session variable is set before queries execute
  // This persists for the connection lifetime
  // Using set_config() with template tag parameterization is safer than string interpolation
  await sql`SELECT set_config('request.jwt.claims', ${jwtClaims}, false)`;

  // Track cleanup state to make cleanup idempotent
  let isCleanedUp = false;

  const cleanup = async () => {
    // Idempotent cleanup: safe to call multiple times
    if (isCleanedUp) {
      return;
    }
    isCleanedUp = true;

    try {
      await sql.end({ timeout: 5 });
    } catch (error) {
      // Log but don't throw - connection cleanup errors shouldn't fail the request
      // The connection will eventually timeout and close on its own
      logger.warn(
        { error, clerkUserId },
        'Failed to close RLS database connection'
      );
    }
  };

  return {
    db: drizzle(sql, { schema }),
    cleanup,
  };
}

/**
 * Creates an RLS-enforced database client for anonymous users.
 *
 * Uses SET ROLE to switch to the anonymous role, then sets session variables
 * to null to indicate anonymous access.
 *
 * Note: Current product policy keeps user-facing app data authenticated-only.
 * Anonymous clients are primarily used for security tests and any future
 * explicitly-approved public endpoints.
 *
 * @returns Promise resolving to RLS client result with database client and cleanup function
 *
 * @example
 * ```typescript
 * // For RLS security tests
 * const { db: anonDb, cleanup } = await createAnonymousRlsClient();
 * try {
 *   const rows = await anonDb.select().from(learningPlans);
 *   // Should return zero rows for private app data
 * } finally {
 *   await cleanup(); // Close connection when done
 * }
 * ```
 */
export async function createAnonymousRlsClient(): Promise<RlsClientResult> {
  // Connect with owner role using non-pooling connection (SET ROLE incompatible with poolers)
  // IMPORTANT: The owner role has BYPASSRLS privilege which bypasses RLS policies.
  // We use SET ROLE to switch to anonymous role which lacks BYPASSRLS.
  // Must use non-pooling connection because poolers may not handle SET ROLE correctly.
  const connectionUrl = databaseEnv.nonPoolingUrl || databaseEnv.url;
  const sql: Sql = postgres(connectionUrl, {
    max: 1, // Single connection per client
    idle_timeout: 20,
    connect_timeout: 10,
  });

  // Switch to anonymous role (without BYPASSRLS privilege)
  // CRITICAL: Must await to ensure role is switched before setting session variable
  await sql.unsafe('SET ROLE anonymous');

  // Set search_path after SET ROLE (role switch may reset it)
  await sql.unsafe('SET search_path = public');

  // Set session variable to JSON null for RLS policy compatibility
  // CRITICAL: Must await to ensure session variable is set before queries execute
  // This allows policies to safely cast and check for null
  // Using set_config() with template tag parameterization is safer than string interpolation
  await sql`SELECT set_config('request.jwt.claims', ${'null'}, false)`;

  // Track cleanup state to make cleanup idempotent
  let isCleanedUp = false;

  const cleanup = async () => {
    // Idempotent cleanup: safe to call multiple times
    if (isCleanedUp) {
      return;
    }
    isCleanedUp = true;

    try {
      await sql.end({ timeout: 5 });
    } catch (error) {
      // Log but don't throw - connection cleanup errors shouldn't fail the request
      // The connection will eventually timeout and close on its own
      logger.warn(
        { error },
        'Failed to close anonymous RLS database connection'
      );
    }
  };

  return {
    db: drizzle(sql, { schema }),
    cleanup,
  };
}

/**
 * Type alias for the RLS-enforced database client.
 * This matches the type of the service-role client for compatibility.
 */
export type RlsClient = Awaited<
  ReturnType<typeof createAuthenticatedRlsClient>
>['db'];
