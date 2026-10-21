import type { DbClient } from '@/lib/db/types';
import type { EmailNotificationCategory } from '@/shared/types/db.types';
import type { SQL } from 'drizzle-orm';

import { executeRows } from '@/lib/db/execute-rows';
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
  preferredAiModel: string | null;
  preferredRegenerationAiModel: string | null;
  preferredLessonAiModel: string | null;
  analyticsTimezone: string;
};

/** Pro picks for the grounded pipeline's writer, verifier and advisor roles. */
export type GroundedModelPreferenceValues = {
  preferredWriterAiModel: string | null;
  preferredVerifierAiModel: string | null;
  preferredAdvisorAiModel: string | null;
};

export type UserModelPreferencePatch = {
  preferredAiModel?: string | null;
  preferredRegenerationAiModel?: string | null;
  preferredLessonAiModel?: string | null;
  preferredWriterAiModel?: string | null;
  preferredVerifierAiModel?: string | null;
  preferredAdvisorAiModel?: string | null;
};

export type UserModelPreferenceValues = UserPreferenceValues &
  GroundedModelPreferenceValues;

export const DEFAULT_USER_PREFERENCES: UserPreferenceValues = {
  preferredAiModel: null,
  preferredRegenerationAiModel: null,
  preferredLessonAiModel: null,
  analyticsTimezone: 'UTC',
};

export const DEFAULT_GROUNDED_MODEL_PREFERENCES: GroundedModelPreferenceValues =
  {
    preferredWriterAiModel: null,
    preferredVerifierAiModel: null,
    preferredAdvisorAiModel: null,
  };

function mapPreferenceRow(row: {
  preferred_ai_model: string | null;
  preferred_regeneration_ai_model: string | null;
  preferred_lesson_ai_model: string | null;
  analytics_timezone: string;
}): UserPreferenceValues {
  return {
    preferredAiModel: row.preferred_ai_model,
    preferredRegenerationAiModel: row.preferred_regeneration_ai_model,
    preferredLessonAiModel: row.preferred_lesson_ai_model,
    analyticsTimezone: row.analytics_timezone,
  };
}

export async function getUserPreferences(
  userId: string,
  dbClient: Pick<DbClient, 'select'>,
): Promise<UserPreferenceValues> {
  const [row] = await dbClient
    .select({
      preferredAiModel: userPreferences.preferredAiModel,
      preferredRegenerationAiModel:
        userPreferences.preferredRegenerationAiModel,
      preferredLessonAiModel: userPreferences.preferredLessonAiModel,
      analyticsTimezone: userPreferences.analyticsTimezone,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));

  return row ?? DEFAULT_USER_PREFERENCES;
}

export async function getGroundedModelPreferences(
  userId: string,
  dbClient: Pick<DbClient, 'select'>,
): Promise<GroundedModelPreferenceValues> {
  const [row] = await dbClient
    .select({
      preferredWriterAiModel: userPreferences.preferredWriterAiModel,
      preferredVerifierAiModel: userPreferences.preferredVerifierAiModel,
      preferredAdvisorAiModel: userPreferences.preferredAdvisorAiModel,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));

  return row ?? DEFAULT_GROUNDED_MODEL_PREFERENCES;
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

    const [settingsRow] = await executeRows<{
      unsubscribe_all_optional_emails: boolean;
    }>(
      tx,
      sql`
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
    `,
    );

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

    const categoryRows = await executeRows<{
      category: EmailNotificationCategory;
      enabled: boolean;
    }>(
      tx,
      sql`
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
    `,
    );

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

const MODEL_PREFERENCE_COLUMNS = {
  preferredAiModel: 'preferred_ai_model',
  preferredRegenerationAiModel: 'preferred_regeneration_ai_model',
  preferredLessonAiModel: 'preferred_lesson_ai_model',
  preferredWriterAiModel: 'preferred_writer_ai_model',
  preferredVerifierAiModel: 'preferred_verifier_ai_model',
  preferredAdvisorAiModel: 'preferred_advisor_ai_model',
} as const satisfies Record<keyof UserModelPreferencePatch, string>;

type ModelPreferenceField = keyof typeof MODEL_PREFERENCE_COLUMNS;

const MODEL_PREFERENCE_FIELDS = Object.keys(
  MODEL_PREFERENCE_COLUMNS,
) as ModelPreferenceField[];

export async function upsertUserModelPreferences(
  userId: string,
  patch: UserModelPreferencePatch,
  dbClient: Pick<DbClient, 'execute'>,
): Promise<UserModelPreferenceValues | undefined> {
  const columns = MODEL_PREFERENCE_FIELDS.map((field) =>
    sql.identifier(MODEL_PREFERENCE_COLUMNS[field]),
  );
  const inserts = MODEL_PREFERENCE_FIELDS.map((field) => {
    const value = patch[field];
    return value !== undefined ? sql`${value}` : sql`DEFAULT`;
  });

  const updates: SQL[] = [sql`"updated_at" = now()`];
  for (const field of MODEL_PREFERENCE_FIELDS) {
    if (patch[field] !== undefined) {
      const column = sql.identifier(MODEL_PREFERENCE_COLUMNS[field]);
      updates.push(sql`${column} = EXCLUDED.${column}`);
    }
  }

  const [row] = await executeRows<
    Record<
      (typeof MODEL_PREFERENCE_COLUMNS)[ModelPreferenceField],
      string | null
    > & {
      analytics_timezone: string;
    }
  >(
    dbClient,
    sql`
    INSERT INTO ${userPreferences} (
      "user_id",
      ${sql.join(columns, sql`, `)},
      "updated_at"
    )
    VALUES (
      ${userId},
      ${sql.join(inserts, sql`, `)},
      now()
    )
    ON CONFLICT ("user_id") DO UPDATE SET
      ${sql.join(updates, sql`, `)}
    RETURNING
      ${sql.join(columns, sql`, `)},
      "analytics_timezone"
  `,
  );

  if (!row) {
    return undefined;
  }
  return {
    ...mapPreferenceRow(row),
    preferredWriterAiModel: row.preferred_writer_ai_model,
    preferredVerifierAiModel: row.preferred_verifier_ai_model,
    preferredAdvisorAiModel: row.preferred_advisor_ai_model,
  };
}

export async function upsertUserAnalyticsTimezone(
  userId: string,
  analyticsTimezone: string,
  dbClient: Pick<DbClient, 'execute'>,
): Promise<UserPreferenceValues | undefined> {
  const [row] = await executeRows<{
    preferred_ai_model: string | null;
    preferred_regeneration_ai_model: string | null;
    preferred_lesson_ai_model: string | null;
    analytics_timezone: string;
  }>(
    dbClient,
    sql`
    INSERT INTO ${userPreferences} ("user_id", "analytics_timezone", "updated_at")
    VALUES (${userId}, ${analyticsTimezone}, now())
    ON CONFLICT ("user_id") DO UPDATE SET
      "analytics_timezone" = EXCLUDED."analytics_timezone",
      "updated_at" = EXCLUDED."updated_at"
    RETURNING
      "preferred_ai_model",
      "preferred_regeneration_ai_model",
      "preferred_lesson_ai_model",
      "analytics_timezone"
  `,
  );

  return row ? mapPreferenceRow(row) : undefined;
}
