/**
 * RLS (Row Level Security) Test Helpers
 *
 * This module provides test utilities for creating database clients with different
 * auth contexts to verify RLS policies work correctly.
 *
 * NEON RLS ARCHITECTURE (Session Variable Approach):
 * - All clients use the same database URL (owner role)
 * - RLS ensures policies apply via session variables
 * - Session variables differentiate between users:
 *   - Authenticated: request.jwt.claims = '{"sub": "clerk_user_id"}'
 *   - Anonymous: request.jwt.claims = 'null'
 *   - Service (test setup): Regular db client from drizzle.ts (has BYPASSRLS)
 *
 * USAGE:
 * - createAnonRlsDb() - Creates client with session variable set to null
 * - createRlsDbForUser() - Creates client with user's Clerk ID in session variable
 * - getServiceRoleDb() - Returns service-role client (bypasses RLS for setup/cleanup)
 */

import { db } from '@/lib/db/service-role';
import {
  createAnonymousRlsClient,
  createAuthenticatedRlsClient,
} from '@/lib/db/rls';

/**
 * Creates an RLS-enforced database client for an anonymous user.
 *
 * Uses the anonymous database role which provides very restricted access.
 * RLS policies will see null for the user ID.
 *
 * Note: The underlying connection will be closed automatically via idle_timeout.
 * For long-running tests, consider calling cleanup() from the full result.
 *
 * @returns Promise resolving to Drizzle database client with RLS enforcement (anonymous)
 */
export async function createAnonRlsDb() {
  const result = await createAnonymousRlsClient();
  return result.db;
}

/**
 * Creates an RLS-enforced database client for a specific authenticated user.
 *
 * Uses the authenticated database role with session variables to enforce
 * user-specific access control via RLS policies.
 *
 * Note: The underlying connection will be closed automatically via idle_timeout.
 * For long-running tests, consider calling cleanup() from the full result.
 *
 * @param clerkUserId - The Clerk user ID (e.g., "user_123")
 * @returns Promise resolving to Drizzle database client with RLS enforcement for this user
 */
export async function createRlsDbForUser(clerkUserId: string) {
  const result = await createAuthenticatedRlsClient(clerkUserId);
  return result.db;
}

/**
 * Returns the service-role database client that bypasses RLS.
 *
 * This client uses the database owner role and is used for test setup
 * and cleanup operations that need to bypass RLS policies.
 *
 * @returns Drizzle database client with RLS bypassed (service role)
 */
export function getServiceRoleDb() {
  return db;
}
