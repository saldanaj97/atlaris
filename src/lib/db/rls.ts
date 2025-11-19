/**
 * RLS-enforced Drizzle client for Neon
 *
 * This module provides RLS-enforced database clients using SET ROLE to switch
 * to non-privileged database roles, combined with session variables for access control.
 *
 * USAGE:
 * - Request handlers: Use createAuthenticatedRlsClient() with the user's Clerk ID
 * - Anonymous access: Use createAnonymousRlsClient()
 * - Workers/background jobs: Use the service-role client from @/lib/db/drizzle
 * - Tests: Use helper functions from tests/helpers/rls.ts
 *
 * NEON RLS ARCHITECTURE (SET ROLE + Session Variable Approach):
 * - Connect with DATABASE_URL (owner role with BYPASSRLS privilege)
 * - Use SET ROLE to switch to 'authenticated' or 'anonymous' roles (no BYPASSRLS)
 * - Set session variable request.jwt.claims to identify the user
 * - FORCE RLS + roles without BYPASSRLS ensure policies are enforced
 *
 * CRITICAL: The owner role has BYPASSRLS privilege which ignores FORCE RLS.
 * We use SET ROLE to switch to non-privileged roles that lack BYPASSRLS.
 * This allows a single connection pool while maintaining RLS security.
 */

import { databaseEnv } from '@/lib/config/env';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Creates an RLS-enforced database client for authenticated users.
 *
 * Uses SET ROLE to switch to the authenticated role, then sets session variables
 * to identify the user. RLS policies check both the role and session variable
 * to enforce user-specific access control.
 *
 * @param clerkUserId - The Clerk user ID for the authenticated user
 * @returns Promise resolving to Drizzle database client with RLS enforcement for this user
 *
 * @example
 * ```typescript
 * // In an API route handler
 * const userId = await getEffectiveClerkUserId();
 * const rlsDb = await createAuthenticatedRlsClient(userId);
 * const plans = await rlsDb.select().from(learningPlans);
 * // Only returns plans owned by this user
 * ```
 */
export async function createAuthenticatedRlsClient(clerkUserId: string) {
  const jwtClaims = JSON.stringify({ sub: clerkUserId });

  // Connect with owner role using non-pooling connection (SET ROLE incompatible with poolers)
  // IMPORTANT: The owner role has BYPASSRLS privilege which bypasses FORCE RLS.
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

  // Set session variable with user's Clerk ID
  // CRITICAL: Must await to ensure session variable is set before queries execute
  // This persists for the connection lifetime
  const setCommand = `SET request.jwt.claims = '${jwtClaims.replace(/'/g, "''")}'`;
  await sql.unsafe(setCommand);

  return drizzle(sql, { schema });
}

/**
 * Creates an RLS-enforced database client for anonymous users.
 *
 * Uses SET ROLE to switch to the anonymous role, then sets session variables
 * to null to indicate anonymous access. RLS policies will restrict access to
 * public resources only.
 *
 * @returns Promise resolving to Drizzle database client with RLS enforcement for anonymous users
 *
 * @example
 * ```typescript
 * // For public queries
 * const anonDb = await createAnonymousRlsClient();
 * const publicPlans = await anonDb.select().from(learningPlans);
 * // Only returns plans with visibility='public'
 * ```
 */
export async function createAnonymousRlsClient() {
  // Connect with owner role using non-pooling connection (SET ROLE incompatible with poolers)
  // IMPORTANT: The owner role has BYPASSRLS privilege which bypasses FORCE RLS.
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
  await sql.unsafe(`SET request.jwt.claims = 'null'`);

  return drizzle(sql, { schema });
}

/**
 * Type alias for the RLS-enforced database client.
 * This matches the type of the service-role client for compatibility.
 */
export type RlsClient = ReturnType<typeof createAuthenticatedRlsClient>;
