import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 6);

function sanitizeScenario(scenario: string): string {
  return scenario
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Builds a unique auth user id for tests with a stable prefix suitable for debugging.
 * @param scenario - Human-friendly scenario name
 */
export function buildTestAuthUserId(scenario: string): string {
  const timestamp = Date.now().toString(36);
  const suffix = nanoid();
  const sanitized = sanitizeScenario(scenario || 'test');
  return `auth_test_${sanitized}-${timestamp}-${suffix}`;
}

/**
 * Builds an email address that stays unique per test run.
 * @param authUserId - Auth user id used to build the email
 */
export function buildTestEmail(authUserId: string): string {
  return `${authUserId}@example.test`;
}
