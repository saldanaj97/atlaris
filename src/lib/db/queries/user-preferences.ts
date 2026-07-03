import type { PreferredAiModel } from '../../../../supabase/enums';
import type { DbClient } from '@/lib/db/types';

import { userPreferences } from '@supabase/schema';
import { eq, sql } from 'drizzle-orm';

export type UserPreferenceValues = {
  preferredAiModel: PreferredAiModel | null;
  analyticsTimezone: string;
};

export const DEFAULT_USER_PREFERENCES: UserPreferenceValues = {
  preferredAiModel: null,
  analyticsTimezone: 'UTC',
};

export async function getUserPreferences(
  userId: string,
  dbClient: DbClient,
): Promise<UserPreferenceValues> {
  const [row] = await dbClient
    .select({
      preferredAiModel: userPreferences.preferredAiModel,
      analyticsTimezone: userPreferences.analyticsTimezone,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));

  return row ?? DEFAULT_USER_PREFERENCES;
}

export async function upsertUserPreferredAiModel(
  userId: string,
  preferredAiModel: PreferredAiModel | null,
  dbClient: DbClient,
): Promise<UserPreferenceValues | undefined> {
  const [row] = await dbClient
    .insert(userPreferences)
    .values({
      userId,
      preferredAiModel,
      updatedAt: sql<Date>`now()`,
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        preferredAiModel: sql`excluded.preferred_ai_model`,
        updatedAt: sql`excluded.updated_at`,
      },
    })
    .returning({
      preferredAiModel: userPreferences.preferredAiModel,
      analyticsTimezone: userPreferences.analyticsTimezone,
    });

  return row;
}

export async function upsertUserAnalyticsTimezone(
  userId: string,
  analyticsTimezone: string,
  dbClient: DbClient,
): Promise<UserPreferenceValues | undefined> {
  const [row] = await dbClient
    .insert(userPreferences)
    .values({
      userId,
      analyticsTimezone,
      updatedAt: sql<Date>`now()`,
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        analyticsTimezone: sql`excluded.analytics_timezone`,
        updatedAt: sql`excluded.updated_at`,
      },
    })
    .returning({
      preferredAiModel: userPreferences.preferredAiModel,
      analyticsTimezone: userPreferences.analyticsTimezone,
    });

  return row;
}
