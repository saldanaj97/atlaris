import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);

/**
 * Builds a unique Clerk user id for tests.
 * @param prefix - Human-friendly prefix used in ids for debugging
 */
export function buildTestClerkUserId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  return `${prefix}-${timestamp}-${nanoid()}`;
}

/**
 * Builds an email address that stays unique per test run.
 * @param clerkUserId - Clerk user id used to build the email
 */
export function buildTestEmail(clerkUserId: string): string {
  return `${clerkUserId}@example.com`;
}
