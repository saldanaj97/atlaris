import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 6);

function sanitizeScenario(scenario: string): string {
  return scenario
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Builds a unique Clerk user id for tests with a stable prefix suitable for debugging.
 * @param scenario - Human-friendly scenario name
 */
export function buildTestClerkUserId(scenario: string): string {
  const timestamp = Date.now().toString(36);
  const suffix = nanoid();
  const sanitized = sanitizeScenario(scenario || 'test');
  return `clerk_test_${sanitized}-${timestamp}-${suffix}`;
}

/**
 * Builds an email address that stays unique per test run.
 * @param clerkUserId - Clerk user id used to build the email
 */
export function buildTestEmail(clerkUserId: string): string {
  return `${clerkUserId}@example.test`;
}
