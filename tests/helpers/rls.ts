/**
 * RLS (Row Level Security) Testing Helpers
 *
 * These helpers allow testing Supabase RLS policies by creating clients
 * with different authentication contexts.
 *
 * IMPORTANT: RLS testing is separate from business logic testing.
 * - Business logic tests use direct Postgres connection (RLS bypassed)
 * - RLS tests use Supabase clients with proper auth context (RLS enforced)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { generateTestClerkJwt } from './jwt';

/**
 * Creates a Supabase client with service_role key that bypasses RLS.
 * Use this for test setup (creating test data) and cleanup.
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey || serviceKey === 'your_service_role_key_here') {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY not set in .env.test. ' +
        'Get it from: https://supabase.com/dashboard/project/ulfujbbaiycqomnapxjp/settings/api'
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Creates an anonymous Supabase client (not authenticated).
 * Use this to test public access and anonymous user permissions.
 */
export function createAnonClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY not set in .env.test'
    );
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Creates an authenticated Supabase client for a specific Clerk user.
 *
 * This function generates a test JWT with the Clerk user ID and creates a
 * Supabase client that uses this JWT for authentication. The JWT is passed
 * in the Authorization header, simulating how production authentication works.
 *
 * How it works:
 * 1. Generates a test JWT with the Clerk user ID in the `sub` claim
 * 2. Creates a Supabase client with the anon key
 * 3. Passes the JWT in the Authorization header
 * 4. Supabase RLS policies extract the user ID via auth.jwt()->>'sub'
 *
 * NOTE: For this to work in practice, Supabase needs to be configured to
 * validate JWTs signed with the TEST_JWT_SECRET. In a test environment,
 * you can configure this in Supabase's JWT settings, or use Supabase's
 * built-in JWT validation with the project's JWT secret.
 *
 * @param clerkUserId - The Clerk user ID to authenticate as (e.g., "user_2abc123")
 * @returns Supabase client authenticated as the specified user
 *
 * @example
 * ```typescript
 * const userClient = createAuthenticatedClient('user_123');
 * const { data } = await userClient.from('learning_plans').select('*');
 * // Only returns plans owned by user_123 (RLS enforced)
 * ```
 */
export function createAuthenticatedClient(clerkUserId: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY not set in .env.test'
    );
  }

  // Generate a test JWT with the Clerk user ID
  const jwt = generateTestClerkJwt(clerkUserId);

  // Create a Supabase client with the JWT in the Authorization header
  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
