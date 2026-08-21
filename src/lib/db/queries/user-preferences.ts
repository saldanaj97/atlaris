import type { DbClient } from '@/lib/db/types';
import type { EmailNotificationCategory } from '@/shared/types/db.types';
import type { PreferredAiModel } from '@supabase/enums';

import {
  prepareRlsTransactionContext,
  reapplyJwtClaimsInTransaction,
} from '@/lib/db/queries/helpers/rls-jwt-claims';
import {
  DEFAULT_EMAIL_NOTIFICATION_PREFERENCES,
  type EmailNotificationPreferenceValues,
} from '@/shared/notifications/email-preferences';
import { emailNotificationCategory } from '@supabase/enums';
import {
  userEmailNotificationPreferences,
  userEmailNotificationSettings,
  userPreferences,
} from '@supabase/schema';
import { eq, sql } from 'drizzle-orm';

export const EMAIL_NOTIFICATION_CATEGORIES =
  emailNotificationCategory.enumValues;

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
  dbClient: Pick<DbClient, 'select'>,
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

export async function getEmailNotificationPreferences(
  userId: string,
  dbClient: Pick<DbClient, 'select'>,
): Promise<EmailNotificationPreferenceValues> {
  const [settingsRows, categoryRows] = await Promise.all([
    dbClient
      .select({
        unsubscribeAllOptionalEmails:
          userEmailNotificationSettings.unsubscribeAllOptionalEmails,
      })
      .from(userEmailNotificationSettings)
      .where(eq(userEmailNotificationSettings.userId, userId)),
    dbClient
      .select({
        category: userEmailNotificationPreferences.category,
        enabled: userEmailNotificationPreferences.enabled,
      })
      .from(userEmailNotificationPreferences)
      .where(eq(userEmailNotificationPreferences.userId, userId)),
  ]);
  const [settingsRow] = settingsRows;

  const categories = {
    ...DEFAULT_EMAIL_NOTIFICATION_PREFERENCES.categories,
  };

  for (const row of categoryRows) {
    categories[row.category] = row.enabled;
  }

  return {
    unsubscribeAllOptionalEmails:
      settingsRow?.unsubscribeAllOptionalEmails ??
      DEFAULT_EMAIL_NOTIFICATION_PREFERENCES.unsubscribeAllOptionalEmails,
    categories,
  };
}

export async function saveEmailNotificationPreferences(
  userId: string,
  values: EmailNotificationPreferenceValues,
  dbClient: Pick<DbClient, 'execute' | 'transaction'>,
): Promise<EmailNotificationPreferenceValues> {
  const rlsCtx = await prepareRlsTransactionContext(dbClient);

  return dbClient.transaction(async (tx) => {
    await reapplyJwtClaimsInTransaction(tx, rlsCtx);

    const currentRows = await tx
      .select({
        category: userEmailNotificationPreferences.category,
        enabled: userEmailNotificationPreferences.enabled,
        unsubscribedAt: userEmailNotificationPreferences.unsubscribedAt,
      })
      .from(userEmailNotificationPreferences)
      .where(eq(userEmailNotificationPreferences.userId, userId));

    const currentByCategory = new Map<
      EmailNotificationCategory,
      (typeof currentRows)[number]
    >();

    for (const row of currentRows) {
      currentByCategory.set(row.category, row);
    }

    const [settingsRow] = (await tx.execute(sql`
      INSERT INTO ${userEmailNotificationSettings} (
        "user_id",
        "unsubscribe_all_optional_emails",
        "updated_at"
      )
      VALUES (
        ${userId},
        ${values.unsubscribeAllOptionalEmails},
        now()
      )
      ON CONFLICT ("user_id") DO UPDATE SET
        "unsubscribe_all_optional_emails" = EXCLUDED."unsubscribe_all_optional_emails",
        "updated_at" = now()
      RETURNING "unsubscribe_all_optional_emails"
    `)) as Array<{ unsubscribe_all_optional_emails: boolean }>;

    if (!settingsRow) {
      throw new Error('Failed to persist email notification settings row.');
    }

    const categories = {
      ...DEFAULT_EMAIL_NOTIFICATION_PREFERENCES.categories,
    };

    const categoryValues = EMAIL_NOTIFICATION_CATEGORIES.map((category) => {
      const enabled = values.categories[category];
      const current = currentByCategory.get(category);
      const unsubscribedAt = enabled
        ? null
        : current?.enabled === true
          ? sql<Date>`now()`
          : (current?.unsubscribedAt ?? null);

      return sql`(
        ${userId},
        ${category}::email_notification_category,
        ${enabled},
        ${unsubscribedAt},
        now()
      )`;
    });

    const categoryRows = (await tx.execute(sql`
      INSERT INTO ${userEmailNotificationPreferences} (
        "user_id",
        "category",
        "enabled",
        "unsubscribed_at",
        "updated_at"
      )
      VALUES ${sql.join(categoryValues, sql`, `)}
      ON CONFLICT ("user_id", "category") DO UPDATE SET
        "enabled" = EXCLUDED."enabled",
        "unsubscribed_at" = EXCLUDED."unsubscribed_at",
        "updated_at" = now()
      RETURNING "category", "enabled"
    `)) as Array<{
      category: EmailNotificationCategory;
      enabled: boolean;
    }>;

    if (categoryRows.length !== EMAIL_NOTIFICATION_CATEGORIES.length) {
      throw new Error('Failed to persist email notification category rows.');
    }

    for (const row of categoryRows) {
      categories[row.category] = row.enabled;
    }

    return {
      unsubscribeAllOptionalEmails: settingsRow.unsubscribe_all_optional_emails,
      categories,
    };
  });
}

export async function upsertUserPreferredAiModel(
  userId: string,
  preferredAiModel: PreferredAiModel | null,
  dbClient: Pick<DbClient, 'execute'>,
): Promise<UserPreferenceValues | undefined> {
  const [row] = (await dbClient.execute(sql`
    INSERT INTO ${userPreferences} ("user_id", "preferred_ai_model", "updated_at")
    VALUES (${userId}, ${preferredAiModel}, now())
    ON CONFLICT ("user_id") DO UPDATE SET
      "preferred_ai_model" = EXCLUDED."preferred_ai_model",
      "updated_at" = EXCLUDED."updated_at"
    RETURNING "preferred_ai_model", "analytics_timezone"
  `)) as Array<{
    preferred_ai_model: PreferredAiModel | null;
    analytics_timezone: string;
  }>;

  return row
    ? {
        preferredAiModel: row.preferred_ai_model,
        analyticsTimezone: row.analytics_timezone,
      }
    : undefined;
}

export async function upsertUserAnalyticsTimezone(
  userId: string,
  analyticsTimezone: string,
  dbClient: Pick<DbClient, 'execute'>,
): Promise<UserPreferenceValues | undefined> {
  const [row] = (await dbClient.execute(sql`
    INSERT INTO ${userPreferences} ("user_id", "analytics_timezone", "updated_at")
    VALUES (${userId}, ${analyticsTimezone}, now())
    ON CONFLICT ("user_id") DO UPDATE SET
      "analytics_timezone" = EXCLUDED."analytics_timezone",
      "updated_at" = EXCLUDED."updated_at"
    RETURNING "preferred_ai_model", "analytics_timezone"
  `)) as Array<{
    preferred_ai_model: PreferredAiModel | null;
    analytics_timezone: string;
  }>;

  return row
    ? {
        preferredAiModel: row.preferred_ai_model,
        analyticsTimezone: row.analytics_timezone,
      }
    : undefined;
}
