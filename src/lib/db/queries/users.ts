import type {
  ActorUser,
  CreateUserData,
  DbUser,
  UsersDbClient,
} from '@/lib/db/queries/types/users.types';

import {
  DEFAULT_USER_PREFERENCES,
  type UserPreferenceValues,
} from '@/lib/db/queries/user-preferences';
import { userPreferences, users } from '@supabase/schema';
import { eq } from 'drizzle-orm';

function toActorUser(
  user: DbUser,
  preferences: UserPreferenceValues | null,
): ActorUser {
  return {
    ...user,
    preferredAiModel:
      preferences?.preferredAiModel ??
      DEFAULT_USER_PREFERENCES.preferredAiModel,
    preferredRegenerationAiModel:
      preferences?.preferredRegenerationAiModel ??
      DEFAULT_USER_PREFERENCES.preferredRegenerationAiModel,
    preferredLessonAiModel:
      preferences?.preferredLessonAiModel ??
      DEFAULT_USER_PREFERENCES.preferredLessonAiModel,
    analyticsTimezone:
      preferences?.analyticsTimezone ??
      DEFAULT_USER_PREFERENCES.analyticsTimezone,
  };
}

/**
 * User-related queries for account lookup and creation.
 * Callers must pass the request RLS client or an explicit service-role client.
 */

/**
 * Looks up a user by their auth provider ID.
 *
 * @param authUserId - The external auth provider user ID
 * @param dbClient - Required RLS or service-role client
 * @returns The user record, or undefined if not found
 */
export async function getUserByAuthId(
  authUserId: string,
  dbClient: UsersDbClient,
): Promise<ActorUser | undefined> {
  const result = await dbClient
    .select({
      user: users,
      preferences: {
        preferredAiModel: userPreferences.preferredAiModel,
        preferredRegenerationAiModel:
          userPreferences.preferredRegenerationAiModel,
        preferredLessonAiModel: userPreferences.preferredLessonAiModel,
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
 * @param dbClient - Required RLS or service-role client
 * @returns The created user record, or undefined on failure
 */
export async function createUser(
  userData: CreateUserData,
  dbClient: UsersDbClient,
): Promise<DbUser | undefined> {
  const insertData = {
    authUserId: userData.authUserId,
    email: userData.email,
    name: userData.name,
    clerkUserUpdatedAt: userData.clerkUserUpdatedAt,
  };

  const result = await dbClient.insert(users).values(insertData).returning();
  return result[0];
}

/**
 * Creates a user when absent, or returns the row created by a concurrent request.
 * Email conflicts belonging to a different auth identity remain database errors.
 */
export async function getOrCreateUser(
  userData: CreateUserData,
  dbClient: UsersDbClient,
): Promise<ActorUser | undefined> {
  const inserted = await dbClient
    .insert(users)
    .values({
      authUserId: userData.authUserId,
      email: userData.email,
      name: userData.name,
      clerkUserUpdatedAt: userData.clerkUserUpdatedAt,
    })
    .onConflictDoNothing({ target: users.authUserId })
    .returning();

  if (inserted[0]) {
    return toActorUser(inserted[0], null);
  }

  return getUserByAuthId(userData.authUserId, dbClient);
}
