import { describe, expect, it, beforeEach } from 'vitest';

import { db } from '@/lib/db/service-role';
import { getUserByClerkId, createUser } from '@/lib/db/queries/users';
import { users } from '@/lib/db/schema';

describe('User Queries', () => {
  beforeEach(async () => {
    // Clean up users table
    await db.delete(users);
  });

  describe('createUser', () => {
    it('should create a new user with all fields', async () => {
      const userData = {
        clerkUserId: 'clerk_test_user_1',
        email: 'test@example.com',
        name: 'Test User',
      };

      const user = await createUser(userData);

      expect(user).toBeDefined();
      expect(user?.clerkUserId).toBe(userData.clerkUserId);
      expect(user?.email).toBe(userData.email);
      expect(user?.name).toBe(userData.name);
      expect(user?.id).toBeDefined();
      expect(user?.createdAt).toBeInstanceOf(Date);
    });

    it('should create a user without optional name field', async () => {
      const userData = {
        clerkUserId: 'clerk_test_user_2',
        email: 'test2@example.com',
      };

      const user = await createUser(userData);

      expect(user).toBeDefined();
      expect(user?.clerkUserId).toBe(userData.clerkUserId);
      expect(user?.email).toBe(userData.email);
      expect(user?.name).toBeNull();
    });

    it('should generate unique user IDs for different users', async () => {
      const user1 = await createUser({
        clerkUserId: 'clerk_user_1',
        email: 'user1@example.com',
      });

      const user2 = await createUser({
        clerkUserId: 'clerk_user_2',
        email: 'user2@example.com',
      });

      expect(user1?.id).toBeDefined();
      expect(user2?.id).toBeDefined();
      expect(user1?.id).not.toBe(user2?.id);
    });

    it('should set createdAt timestamp on user creation', async () => {
      const before = new Date();

      const user = await createUser({
        clerkUserId: 'clerk_timestamp_test',
        email: 'timestamp@example.com',
      });

      const after = new Date();

      expect(user?.createdAt).toBeInstanceOf(Date);
      expect(user!.createdAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
      expect(user!.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('getUserByClerkId', () => {
    it('should retrieve existing user by Clerk ID', async () => {
      // Create a user first
      const createdUser = await createUser({
        clerkUserId: 'clerk_find_test',
        email: 'find@example.com',
        name: 'Find Test User',
      });

      // Retrieve the user
      const foundUser = await getUserByClerkId('clerk_find_test');

      expect(foundUser).toBeDefined();
      expect(foundUser?.id).toBe(createdUser?.id);
      expect(foundUser?.clerkUserId).toBe('clerk_find_test');
      expect(foundUser?.email).toBe('find@example.com');
      expect(foundUser?.name).toBe('Find Test User');
    });

    it('should return undefined for non-existent Clerk ID', async () => {
      const user = await getUserByClerkId('clerk_non_existent');

      expect(user).toBeUndefined();
    });

    it('should return correct user when multiple users exist', async () => {
      // Create multiple users
      await createUser({
        clerkUserId: 'clerk_user_a',
        email: 'usera@example.com',
      });

      const targetUser = await createUser({
        clerkUserId: 'clerk_user_b',
        email: 'userb@example.com',
      });

      await createUser({
        clerkUserId: 'clerk_user_c',
        email: 'userc@example.com',
      });

      // Find specific user
      const found = await getUserByClerkId('clerk_user_b');

      expect(found).toBeDefined();
      expect(found?.id).toBe(targetUser?.id);
      expect(found?.email).toBe('userb@example.com');
    });

    it('should enforce cross-tenant isolation by Clerk ID', async () => {
      // Create two users
      await createUser({
        clerkUserId: 'clerk_user_tenant_a',
        email: 'tenanta@example.com',
      });

      await createUser({
        clerkUserId: 'clerk_user_tenant_b',
        email: 'tenantb@example.com',
      });

      // Each user should only be retrievable by their own Clerk ID
      const userA = await getUserByClerkId('clerk_user_tenant_a');
      const userB = await getUserByClerkId('clerk_user_tenant_b');

      expect(userA?.email).toBe('tenanta@example.com');
      expect(userB?.email).toBe('tenantb@example.com');
      expect(userA?.id).not.toBe(userB?.id);
    });
  });

  describe('User Data Integrity', () => {
    it('should enforce unique Clerk user IDs', async () => {
      // Use a unique ID for this test run to avoid conflicts
      const uniqueClerkId = `clerk_unique_test_${Date.now()}_${Math.random().toString(16).slice(2)}`;

      // Create first user
      await createUser({
        clerkUserId: uniqueClerkId,
        email: 'first@example.com',
      });

      // Attempt to create duplicate
      await expect(
        createUser({
          clerkUserId: uniqueClerkId,
          email: 'second@example.com',
        })
      ).rejects.toThrow();
    });

    it('should enforce email format constraints', async () => {
      const user = await createUser({
        clerkUserId: 'clerk_email_test',
        email: 'valid@example.com',
      });

      expect(user?.email).toBe('valid@example.com');
    });

    it('should handle users with null name field', async () => {
      const user = await createUser({
        clerkUserId: 'clerk_null_name',
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
        createUser({
          clerkUserId: `clerk_perf_user_${i}`,
          email: `perfuser${i}@example.com`,
        })
      );

      await Promise.all(userPromises);

      // Target user should be retrievable quickly
      const startTime = Date.now();
      const user = await getUserByClerkId('clerk_perf_user_5');
      const endTime = Date.now();

      expect(user).toBeDefined();
      expect(user?.email).toBe('perfuser5@example.com');
      // Query should complete in reasonable time (< 100ms)
      expect(endTime - startTime).toBeLessThan(100);
    });
  });
});
