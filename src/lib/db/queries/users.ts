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

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  if ('code' in error && error.code === '23505') {
    return true;
  }
  return 'cause' in error && isUniqueViolation(error.cause);
}

/**
 * Creates a user when absent, or returns the row created by a concurrent request.
 * Email conflicts belonging to a different auth identity remain database errors.
 *
 * Only `auth_user_id` arbitrates the conflict, so a concurrent insert of the same
 * row can still fail on `users_email_unique`. That violation is resolved by
 * re-reading this auth identity; it is re-raised when no row for it exists.
 * The re-read needs a non-transactional client: a failed statement aborts a
 * surrounding transaction.
 */
export async function getOrCreateUser(
  userData: CreateUserData,
  dbClient: UsersDbClient,
): Promise<ActorUser | undefined> {
  let inserted: DbUser[];
  try {
    inserted = await dbClient
      .insert(users)
      .values({
        authUserId: userData.authUserId,
        email: userData.email,
        name: userData.name,
        clerkUserUpdatedAt: userData.clerkUserUpdatedAt,
      })
      .onConflictDoNothing({ target: users.authUserId })
      .returning();
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    const existing = await getUserByAuthId(userData.authUserId, dbClient);
    if (!existing) {
      throw error;
    }
    return existing;
  }

  if (inserted[0]) {
    return toActorUser(inserted[0], null);
  }

  return getUserByAuthId(userData.authUserId, dbClient);
}
