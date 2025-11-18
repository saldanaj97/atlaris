/**
 * RLS-enforced Drizzle client for Neon
 *
 * This module provides an RLS-enforced database client that sets JWT claims
 * as PostgreSQL session variables. This enables Row Level Security policies
 * to enforce tenant isolation using current_setting().
 *
 * USAGE:
 * - Request handlers: Use createRlsClient() with the user's Clerk ID
 * - Workers/background jobs: Use the service-role client from @/lib/db/drizzle
 * - Tests: Use createRlsClient() for RLS testing, service client for business logic
 *
 * ARCHITECTURE:
 * - Uses postgres-js (not Neon HTTP) to support session variables properly
 * - Sets request.jwt.claims before each transaction
 * - RLS policies extract user ID via current_setting('request.jwt.claims', true)::json->>'sub'
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { databaseEnv } from '@/lib/config/env';
import * as schema from './schema';

/**
 * Creates an RLS-enforced Drizzle client for a specific Clerk user.
 *
 * This creates a connection that automatically sets the JWT claims before queries,
 * allowing RLS policies to scope data to the authenticated user.
 *
 * IMPORTANT: For simplicity, this takes just the Clerk user ID. The full JWT
 * claims are constructed internally with { sub: clerkUserId }.
 *
 * @param clerkUserId - The Clerk user ID (e.g., "user_123")
 * @returns Drizzle database client with RLS enforcement
 *
 * @example
 * ```typescript
 * // In an API route handler
 * const userId = await getEffectiveClerkUserId();
 * const rlsDb = createRlsClient(userId);
 *
 * // Queries are automatically scoped to this user via RLS
 * const plans = await rlsDb.select().from(learningPlans);
 * ```
 */
export function createRlsClient(clerkUserId: string) {
  // Set the JWT claims for this client
  const jwtClaims = JSON.stringify({ sub: clerkUserId });

  // Create a postgres-js client with onconnect hook to set session variable
  const sql = postgres(databaseEnv.url, {
    max: 1, // Single connection per client (important for session variable isolation)
    idle_timeout: 20, // Close idle connections after 20s
    connect_timeout: 10, // Timeout for connection attempts
    // Set the JWT claims session variable when the connection is established
    onconnect: async (connection) => {
      await connection.query(
        `SET request.jwt.claims = '${jwtClaims.replace(/'/g, "''")}'`
      );
    },
  });

  // Return a Drizzle instance with the RLS-enforced client
  return drizzle(sql, { schema });
}

/**
 * Type alias for the RLS-enforced database client.
 * This matches the type of the service-role client for compatibility.
 */
export type RlsClient = ReturnType<typeof createRlsClient>;
