import { getRequestContext } from '@/lib/api/context';
import { isValidModelId } from '@/lib/ai/ai-models';
import { cleanupDbClient } from '@/lib/db/queries/helpers/db-client-lifecycle';
import type {
  CreateUserData,
  DbUser,
  DeleteUserResult,
  UsersDbClient,
} from '@/lib/db/queries/types/users.types';
import type { PreferredAiModel } from '@/lib/db/enums';
import { getDb } from '@/lib/db/runtime';
import { users } from '@/lib/db/schema';
import { db as serviceDb } from '@/lib/db/service-role';
import { eq } from 'drizzle-orm';

const SUBSCRIPTION_TIERS = new Set(['free', 'starter', 'pro']);
const SUBSCRIPTION_STATUSES = new Set([
  'active',
  'canceled',
  'past_due',
  'trialing',
]);

function isOptionalString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isOptionalDate(value: unknown): value is Date | null {
  return value === null || value instanceof Date;
}

function isOptionalPreferredAiModel(
  value: unknown
): value is PreferredAiModel | null {
  return value === null || (typeof value === 'string' && isValidModelId(value));
}

function isDbUser(user: unknown): user is DbUser {
  if (!user || typeof user !== 'object') {
    return false;
  }

  const maybeUser = user as Partial<DbUser>;

  return (
    typeof maybeUser.id === 'string' &&
    typeof maybeUser.authUserId === 'string' &&
    typeof maybeUser.email === 'string' &&
    typeof maybeUser.subscriptionTier === 'string' &&
    SUBSCRIPTION_TIERS.has(maybeUser.subscriptionTier) &&
    typeof maybeUser.monthlyExportCount === 'number' &&
    maybeUser.createdAt instanceof Date &&
    maybeUser.updatedAt instanceof Date &&
    isOptionalString(maybeUser.name) &&
    isOptionalString(maybeUser.stripeCustomerId) &&
    isOptionalString(maybeUser.stripeSubscriptionId) &&
    (maybeUser.subscriptionStatus === null ||
      (typeof maybeUser.subscriptionStatus === 'string' &&
        SUBSCRIPTION_STATUSES.has(maybeUser.subscriptionStatus))) &&
    isOptionalDate(maybeUser.subscriptionPeriodEnd) &&
    isOptionalPreferredAiModel(maybeUser.preferredAiModel)
  );
}

interface GetUserByAuthIdDeps {
  getRequestContext: typeof getRequestContext;
  getDb: typeof getDb;
  cleanupDbClient: typeof cleanupDbClient;
}

const defaultGetUserByAuthIdDeps: GetUserByAuthIdDeps = {
  getRequestContext,
  getDb,
  cleanupDbClient,
};

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
  dbClient?: UsersDbClient,
  deps: GetUserByAuthIdDeps = defaultGetUserByAuthIdDeps
): Promise<DbUser | undefined> {
  if (dbClient === undefined) {
    const contextUser = deps.getRequestContext()?.user;
    if (contextUser?.authUserId === authUserId && isDbUser(contextUser)) {
      return contextUser;
    }
  }

  const client = dbClient ?? deps.getDb();

  try {
    const result = await client
      .select()
      .from(users)
      .where(eq(users.authUserId, authUserId));
    return result[0];
  } finally {
    if (dbClient === undefined) {
      await deps.cleanupDbClient(client);
    }
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
  userData: CreateUserData,
  dbClient?: UsersDbClient
): Promise<DbUser | undefined> {
  const client = dbClient ?? getDb();

  try {
    const insertData = {
      authUserId: userData.authUserId,
      email: userData.email,
      name: userData.name,
    };

    const result = await client.insert(users).values(insertData).returning();
    return result[0];
  } finally {
    if (dbClient === undefined) {
      await cleanupDbClient(client);
    }
  }
}

/**
 * Updates a user's preferred AI model.
 *
 * @param userId - Internal user ID
 * @param preferredAiModel - Valid model ID from the preferred_ai_model enum, or null to clear preference
 * @param dbClient - Optional RLS-enforced client; defaults to getDb()
 * @returns The updated user record, or undefined if not found
 */
export async function updateUserPreferredAiModel(
  userId: string,
  preferredAiModel: PreferredAiModel | null,
  dbClient?: UsersDbClient
): Promise<DbUser | undefined> {
  const client = dbClient ?? getDb();

  try {
    const result = await client
      .update(users)
      .set({
        preferredAiModel,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    return result[0];
  } finally {
    if (dbClient === undefined) {
      await cleanupDbClient(client);
    }
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
  // Guard: this function uses the service-role client and must never be
  // called from within a request handler where RLS-scoped clients should
  // be used instead. Detect request context via AsyncLocalStorage.
  const ctx = getRequestContext();
  if (ctx) {
    throw new Error(
      'deleteUserByAuthId must not be called from a request handler. Use an RLS-scoped client instead.'
    );
  }

  const result = await serviceDb
    .delete(users)
    .where(eq(users.authUserId, authUserId))
    .returning({ id: users.id });

  if (result.length === 0) {
    return { deleted: false };
  }

  return { deleted: true, userId: result[0].id };
}
