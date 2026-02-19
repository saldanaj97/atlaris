/**
 * Test factories for user records.
 * Use these instead of direct db.insert or ensureUser when you need
 * unique/randomized test data per run (e.g. tenant scoping tests).
 */

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { users } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

type UserRow = InferSelectModel<typeof users>;
type UserInsert = InferInsertModel<typeof users>;

export type CreateTestUserParams = Partial<
  Pick<UserInsert, 'authUserId' | 'email' | 'name' | 'subscriptionTier'>
>;

/**
 * Inserts a user with unique authUserId and email (using nanoid).
 * Accepts overrides for deterministic tests.
 *
 * @param overrides - Optional overrides (e.g. authUserId, email) for deterministic tests
 * @returns The created user row
 */
export async function createTestUser(
  overrides: CreateTestUserParams = {}
): Promise<UserRow> {
  const baseAuthUserId = `auth_test_${nanoid(12)}`;
  const baseEmail = `test-${nanoid(12)}@example.test`;

  const [row] = await db
    .insert(users)
    .values({
      authUserId: baseAuthUserId,
      email: baseEmail,
      ...overrides,
    } as UserInsert)
    .returning();

  if (!row) {
    throw new Error('Failed to create test user');
  }

  return row;
}

/**
 * Builds an in-memory user fixture without database IO.
 * Useful for unit tests that need a full DbUser shape.
 */
export function buildUserFixture(overrides: Partial<UserRow> = {}): UserRow {
  const now = new Date();

  return {
    id: `user_${nanoid(12)}`,
    authUserId: `auth_test_${nanoid(12)}`,
    email: `test-${nanoid(12)}@example.test`,
    name: null,
    subscriptionTier: 'free',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: null,
    subscriptionPeriodEnd: null,
    monthlyExportCount: 0,
    preferredAiModel: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
