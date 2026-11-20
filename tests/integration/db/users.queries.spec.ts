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
  });
});
