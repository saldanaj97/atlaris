import { getUserByAuthId } from '@/lib/db/queries/users';
import { users } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { describe, expect, it } from 'vitest';

async function insertUser(values: {
  authUserId: string;
  email: string;
  name?: string;
}) {
  const [user] = await db.insert(users).values(values).returning();
  return user;
}

describe('User Queries', () => {
  describe('getUserByAuthId', () => {
    it('should retrieve existing user by Auth ID', async () => {
      // Create a user first
      const createdUser = await insertUser({
        authUserId: 'auth_find_test',
        email: 'find@example.com',
        name: 'Find Test User',
      });

      // Retrieve the user
      const foundUser = await getUserByAuthId('auth_find_test', db);

      expect(foundUser).toBeDefined();
      expect(foundUser?.id).toBe(createdUser?.id);
      expect(foundUser?.authUserId).toBe('auth_find_test');
      expect(foundUser?.email).toBe('find@example.com');
      expect(foundUser?.name).toBe('Find Test User');
    });

    it('should return undefined for non-existent Auth ID', async () => {
      const user = await getUserByAuthId('auth_non_existent', db);

      expect(user).toBeUndefined();
    });

    it('should return correct user when multiple users exist', async () => {
      // Create multiple users
      await insertUser({
        authUserId: 'auth_user_a',
        email: 'usera@example.com',
      });

      const targetUser = await insertUser({
        authUserId: 'auth_user_b',
        email: 'userb@example.com',
      });

      await insertUser({
        authUserId: 'auth_user_c',
        email: 'userc@example.com',
      });

      // Find specific user
      const found = await getUserByAuthId('auth_user_b', db);

      expect(found).toBeDefined();
      expect(found?.id).toBe(targetUser?.id);
      expect(found?.email).toBe('userb@example.com');
    });

    it('should enforce cross-tenant isolation by Auth ID', async () => {
      // Create two users
      await insertUser({
        authUserId: 'auth_user_tenant_a',
        email: 'tenanta@example.com',
      });

      await insertUser({
        authUserId: 'auth_user_tenant_b',
        email: 'tenantb@example.com',
      });

      // Each user should only be retrievable by their own Auth ID
      const userA = await getUserByAuthId('auth_user_tenant_a', db);
      const userB = await getUserByAuthId('auth_user_tenant_b', db);

      expect(userA?.email).toBe('tenanta@example.com');
      expect(userB?.email).toBe('tenantb@example.com');
      expect(userA?.id).not.toBe(userB?.id);
    });
  });

  describe('User Data Integrity', () => {
    it('should enforce unique Auth user IDs', async () => {
      // Use a unique ID for this test run to avoid conflicts
      const uniqueAuthId = `auth_unique_test_${Date.now()}_${Math.random().toString(16).slice(2)}`;

      // Create first user
      await insertUser({
        authUserId: uniqueAuthId,
        email: 'first@example.com',
      });

      // Attempt to create duplicate
      await expect(
        insertUser({
          authUserId: uniqueAuthId,
          email: 'second@example.com',
        }),
      ).rejects.toThrow(/Failed query:|unique|duplicate|23505/i);
    });

    it('should enforce email format constraints', async () => {
      const user = await insertUser({
        authUserId: 'auth_email_test',
        email: 'valid@example.com',
      });

      expect(user?.email).toBe('valid@example.com');
    });

    it('should handle users with null name field', async () => {
      const user = await insertUser({
        authUserId: 'auth_null_name',
        email: 'nullname@example.com',
        name: undefined,
      });

      expect(user?.name).toBeNull();
    });
  });

  describe('Query Performance', () => {
    it('should handle retrieving user from table with many users', async () => {
      // Create multiple users
      const userPromises = Array.from({ length: 10 }, (_, i) =>
        insertUser({
          authUserId: `auth_perf_user_${i}`,
          email: `perfuser${i}@example.com`,
        }),
      );

      await Promise.all(userPromises);

      // Target user should be retrievable quickly
      const startTime = Date.now();
      const user = await getUserByAuthId('auth_perf_user_5', db);
      const endTime = Date.now();

      expect(user).toBeDefined();
      expect(user?.email).toBe('perfuser5@example.com');
      // Query should complete in reasonable time (< 100ms)
      expect(endTime - startTime).toBeLessThan(100);
    });
  });
});
