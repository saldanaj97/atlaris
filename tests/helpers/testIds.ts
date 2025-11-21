/**
 * Test identifier generation utilities.
 * Guarantees uniqueness to avoid DB constraint violations.
 */

/**
 * Build a unique Clerk user ID for tests.
 * Guaranteed unique per call to avoid unique constraint violations.
 *
 * @param scenario - A descriptive scenario name (e.g., 'worker', 'usage-metrics')
 */
export function buildTestClerkUserId(scenario: string): string {
  const unique = `${scenario}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `clerk_test_${unique}`;
}

/**
 * Build a unique email for a test user based on their Clerk ID.
 *
 * @param clerkUserId - The Clerk user ID to build an email for
 */
export function buildTestEmail(clerkUserId: string): string {
  return `${clerkUserId}@example.test`;
}
