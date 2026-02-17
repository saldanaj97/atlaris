import type {
  DbUser,
  DeleteUserResult,
  UsersDbClient,
} from '@/lib/db/queries/types/users.types';
import { getDb } from '@/lib/db/runtime';
import { users } from '@/lib/db/schema';
import { db as serviceDb } from '@/lib/db/service-role';
import { eq } from 'drizzle-orm';

type CleanupCapableClient = UsersDbClient & {
  cleanup?: () => Promise<void>;
  destroy?: () => Promise<void>;
};

async function cleanupInternalClient(
  client: CleanupCapableClient,
  shouldCleanup: boolean
): Promise<void> {
  if (!shouldCleanup) {
    return;
  }

  if (typeof client.cleanup === 'function') {
    await client.cleanup();
    return;
  }

  if (typeof client.destroy === 'function') {
    await client.destroy();
  }
}

/**
 * User-related queries for account lookup, creation, and deletion.
 * Uses RLS-enforced client by default; pass explicit dbClient for DI/testing.
 */

/**
 * Looks up a user by their auth provider ID.
 *
 * @param authUserId - The external auth provider user ID
 * @param dbClient - Optional RLS-enforced client; defaults to getDb()
 * @returns The user record, or undefined if not found
 */
export async function getUserByAuthId(
  authUserId: string,
  dbClient?: UsersDbClient
): Promise<DbUser | undefined> {
  const client = dbClient ?? getDb();
  const shouldCleanup = dbClient === undefined;

  try {
    const result = await client
      .select()
      .from(users)
      .where(eq(users.authUserId, authUserId));
    return result[0];
  } finally {
    await cleanupInternalClient(client as CleanupCapableClient, shouldCleanup);
  }
}

/**
 * Creates a new user record.
 *
 * @param userData - User fields (authUserId, email, optional name)
 * @param dbClient - Optional RLS-enforced client; defaults to getDb()
 * @returns The created user record, or undefined on failure
 */
export async function createUser(
  userData: {
    authUserId: string;
    email: string;
    name?: string | null;
  },
  dbClient?: UsersDbClient
): Promise<DbUser | undefined> {
  const client = dbClient ?? getDb();
  const shouldCleanup = dbClient === undefined;

  try {
    const insertData = {
      authUserId: userData.authUserId,
      email: userData.email,
      name: userData.name,
    };

    const result = await client.insert(users).values(insertData).returning();
    return result[0];
  } finally {
    await cleanupInternalClient(client as CleanupCapableClient, shouldCleanup);
  }
}

/**
 * Deletes a user by their auth provider ID.
 *
 * Uses service-role client (bypasses RLS) because this is called from
 * auth provider webhooks / background workers where no user session exists.
 * Do NOT call this from request handlers — use an RLS-scoped client instead.
 *
 * @param authUserId - The external auth provider user ID
 * @returns Whether the deletion succeeded + the deleted user's ID
 */
export async function deleteUserByAuthId(
  authUserId: string
): Promise<DeleteUserResult> {
  const result = await serviceDb
    .delete(users)
    .where(eq(users.authUserId, authUserId))
    .returning({ id: users.id });

  if (result.length === 0) {
    return { deleted: false };
  }

  return { deleted: true, userId: result[0].id };
}
