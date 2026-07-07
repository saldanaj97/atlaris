import type { PreferredAiModel } from '../../../../supabase/enums';
import type {
  ActorUser,
  CreateUserData,
  DbUser,
  UsersDbClient,
} from '@/lib/db/queries/types/users.types';

import { getRequestContext } from '@/lib/api/context';
import {
  DEFAULT_USER_PREFERENCES,
  type UserPreferenceValues,
} from '@/lib/db/queries/user-preferences';
import { isValidModelId } from '@/shared/constants/ai-models';
import { getDb } from '@supabase/runtime';
import { userPreferences, users } from '@supabase/schema';
import { eq } from 'drizzle-orm';

const SUBSCRIPTION_TIERS = new Set(['free', 'starter', 'pro']);
const SUBSCRIPTION_STATUSES = new Set([
  'active',
  'canceled',
  'past_due',
  'trialing',
]);

interface UsersQueryDeps {
  getDb: typeof getDb;
}

function isOptionalString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isOptionalDate(value: unknown): value is Date | null {
  return value === null || value instanceof Date;
}

function isOptionalPreferredAiModel(
  value: unknown,
): value is PreferredAiModel | null {
  return value === null || (typeof value === 'string' && isValidModelId(value));
}

function hasCoreIdentityFields(maybeUser: Partial<ActorUser>): boolean {
  return (
    typeof maybeUser.id === 'string' &&
    typeof maybeUser.authUserId === 'string' &&
    typeof maybeUser.email === 'string'
  );
}

function hasValidSubscriptionTier(maybeUser: Partial<ActorUser>): boolean {
  return (
    typeof maybeUser.subscriptionTier === 'string' &&
    SUBSCRIPTION_TIERS.has(maybeUser.subscriptionTier)
  );
}

function hasValidSubscriptionStatus(maybeUser: Partial<ActorUser>): boolean {
  return (
    maybeUser.subscriptionStatus === null ||
    (typeof maybeUser.subscriptionStatus === 'string' &&
      SUBSCRIPTION_STATUSES.has(maybeUser.subscriptionStatus))
  );
}

function isActorUser(user: unknown): user is ActorUser {
  if (!user || typeof user !== 'object') {
    return false;
  }

  const maybeUser = user as Partial<ActorUser>;

  return (
    hasCoreIdentityFields(maybeUser) &&
    hasValidSubscriptionTier(maybeUser) &&
    typeof maybeUser.monthlyExportCount === 'number' &&
    maybeUser.createdAt instanceof Date &&
    maybeUser.updatedAt instanceof Date &&
    typeof maybeUser.analyticsTimezone === 'string' &&
    isOptionalString(maybeUser.name) &&
    hasValidSubscriptionStatus(maybeUser) &&
    isOptionalDate(maybeUser.subscriptionPeriodEnd) &&
    isOptionalPreferredAiModel(maybeUser.preferredAiModel)
  );
}

function matchingContextActorUser(
  contextUser: unknown,
  authUserId: string,
): ActorUser | undefined {
  if (
    !contextUser ||
    typeof contextUser !== 'object' ||
    !('authUserId' in contextUser) ||
    (contextUser as { authUserId: string }).authUserId !== authUserId
  ) {
    return undefined;
  }
  return isActorUser(contextUser) ? contextUser : undefined;
}

function toActorUser(
  user: DbUser,
  preferences: UserPreferenceValues | null,
): ActorUser {
  return {
    ...user,
    preferredAiModel:
      preferences?.preferredAiModel ??
      DEFAULT_USER_PREFERENCES.preferredAiModel,
    analyticsTimezone:
      preferences?.analyticsTimezone ??
      DEFAULT_USER_PREFERENCES.analyticsTimezone,
  };
}

interface GetUserByAuthIdDeps extends UsersQueryDeps {
  getRequestContext: typeof getRequestContext;
  cleanupDbClient?: () => Promise<void>;
}

const defaultUsersQueryDeps: UsersQueryDeps = {
  getDb,
};

const defaultGetUserByAuthIdDeps: GetUserByAuthIdDeps = {
  getRequestContext,
  ...defaultUsersQueryDeps,
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
  deps: GetUserByAuthIdDeps = defaultGetUserByAuthIdDeps,
): Promise<ActorUser | undefined> {
  if (dbClient === undefined) {
    const contextUser = deps.getRequestContext()?.user;
    const cached = matchingContextActorUser(contextUser, authUserId);
    if (cached !== undefined) {
      return cached;
    }
  }

  const client = dbClient ?? deps.getDb();

  const result = await client
    .select({
      user: users,
      preferences: {
        preferredAiModel: userPreferences.preferredAiModel,
        analyticsTimezone: userPreferences.analyticsTimezone,
      },
    })
    .from(users)
    .leftJoin(userPreferences, eq(users.id, userPreferences.userId))
    .where(eq(users.authUserId, authUserId));
  const row = result[0];
  return row ? toActorUser(row.user, row.preferences) : undefined;
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
  dbClient?: UsersDbClient,
  deps: UsersQueryDeps = defaultUsersQueryDeps,
): Promise<DbUser | undefined> {
  const client = dbClient ?? deps.getDb();

  const insertData = {
    authUserId: userData.authUserId,
    email: userData.email,
    name: userData.name,
  };

  const result = await client.insert(users).values(insertData).returning();
  return result[0];
}

/**
 * Creates a user when absent, or returns the row created by a concurrent request.
 * Email conflicts belonging to a different auth identity remain database errors.
 */
export async function getOrCreateUser(
  userData: CreateUserData,
  dbClient?: UsersDbClient,
  deps: UsersQueryDeps = defaultUsersQueryDeps,
): Promise<ActorUser | undefined> {
  const client = dbClient ?? deps.getDb();
  const inserted = await client
    .insert(users)
    .values({
      authUserId: userData.authUserId,
      email: userData.email,
      name: userData.name,
    })
    .onConflictDoNothing({ target: users.authUserId })
    .returning();

  if (inserted[0]) {
    return toActorUser(inserted[0], null);
  }

  return getUserByAuthId(userData.authUserId, client);
}
