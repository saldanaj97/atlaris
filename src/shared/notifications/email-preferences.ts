import type { EmailNotificationCategory } from '@/shared/types/db.types';

import { z } from 'zod';

export type EmailNotificationCategoryPreferences = Record<
  EmailNotificationCategory,
  boolean
>;

export type EmailNotificationPreferenceValues = {
  unsubscribeAllOptionalEmails: boolean;
  categories: EmailNotificationCategoryPreferences;
};

export const emailNotificationPreferenceFormValuesSchema = z.strictObject({
  unsubscribeAllOptionalEmails: z.boolean(),
  weeklySummary: z.boolean(),
  dailyReminder: z.boolean(),
  streakReminder: z.boolean(),
});

export type EmailNotificationPreferenceFormValues = z.infer<
  typeof emailNotificationPreferenceFormValuesSchema
>;

export type EmailNotificationCategoryCopy = {
  label: string;
  description: string;
};

export const DEFAULT_EMAIL_NOTIFICATION_PREFERENCES: EmailNotificationPreferenceValues =
  {
    unsubscribeAllOptionalEmails: false,
    categories: {
      weekly_summary: false,
      daily_reminder: false,
      streak_reminder: false,
    },
  };

export function resolveEffectiveEmailPreferences(
  values: EmailNotificationPreferenceValues,
): EmailNotificationCategoryPreferences {
  const enabled = !values.unsubscribeAllOptionalEmails;

  return {
    weekly_summary: enabled && values.categories.weekly_summary,
    daily_reminder: enabled && values.categories.daily_reminder,
    streak_reminder: enabled && values.categories.streak_reminder,
  };
}

export function emailNotificationPreferenceFormValuesFromPreferences(
  values: EmailNotificationPreferenceValues,
): EmailNotificationPreferenceFormValues {
  return {
    unsubscribeAllOptionalEmails: values.unsubscribeAllOptionalEmails,
    weeklySummary: values.categories.weekly_summary,
    dailyReminder: values.categories.daily_reminder,
    streakReminder: values.categories.streak_reminder,
  };
}

export function emailNotificationPreferencesFromFormValues(
  values: EmailNotificationPreferenceFormValues,
): EmailNotificationPreferenceValues {
  return {
    unsubscribeAllOptionalEmails: values.unsubscribeAllOptionalEmails,
    categories: {
      weekly_summary: values.weeklySummary,
      daily_reminder: values.dailyReminder,
      streak_reminder: values.streakReminder,
    },
  };
}

export function getEmailNotificationCategoryCopy(
  category: EmailNotificationCategory,
): EmailNotificationCategoryCopy {
  switch (category) {
    case 'weekly_summary':
      return {
        label: 'Weekly summary emails',
        description:
          'A weekly progress recap with completed work and suggested next steps.',
      };
    case 'daily_reminder':
      return {
        label: 'Daily reminder emails',
        description:
          'A daily prompt to return to active plans and keep momentum.',
      };
    case 'streak_reminder':
      return {
        label: 'Streak reminder emails',
        description: 'A reminder when a learning streak is close to slipping.',
      };
    default: {
      const _exhaustiveCheck: never = category;
      return _exhaustiveCheck;
    }
  }
}
