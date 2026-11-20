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
