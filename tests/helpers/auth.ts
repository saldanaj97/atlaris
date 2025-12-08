/**
 * Sets the test user for API route and business logic testing.
 *
 * IMPORTANT: This helper is for APPLICATION LOGIC testing only.
 *
 * What this does:
 * - Sets DEV_CLERK_USER_ID for your Next.js API routes
 * - Allows testing business logic that depends on the current user
 *
 * What this does NOT do:
 * - Does NOT set Postgres role or JWT context
 * - Does NOT enforce RLS policies
 * - RLS is bypassed because tests use direct postgres connection (see src/lib/db/drizzle.ts)
 *
 * For RLS policy testing, use helpers in tests/helpers/rls.ts instead.
 */
export function setTestUser(clerkUserId: string) {
  process.env.DEV_CLERK_USER_ID = clerkUserId;
}

/**
 * Clears the test user for unauthenticated test scenarios.
 * Use this in tests that need to verify unauthenticated behavior.
 */
export function clearTestUser() {
  delete process.env.DEV_CLERK_USER_ID;
}
