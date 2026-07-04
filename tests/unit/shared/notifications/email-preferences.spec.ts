import {
  emailNotificationPreferenceFormValuesSchema,
  emailNotificationPreferenceFormValuesFromPreferences,
  emailNotificationPreferencesFromFormValues,
  getEmailNotificationCategoryCopy,
  resolveEffectiveEmailPreferences,
} from '@/shared/notifications/email-preferences';
import { describe, expect, it } from 'vitest';

describe('email notification preference helpers', () => {
  it('keeps category choices but masks effective delivery when unsubscribe-all is enabled', () => {
    const preferences = {
      unsubscribeAllOptionalEmails: true,
      categories: {
        weekly_summary: true,
        daily_reminder: true,
        streak_reminder: false,
      },
    };

    expect(resolveEffectiveEmailPreferences(preferences)).toEqual({
      weekly_summary: false,
      daily_reminder: false,
      streak_reminder: false,
    });
  });

  it('round trips form values and category preferences', () => {
    const formValues = {
      unsubscribeAllOptionalEmails: false,
      weeklySummary: true,
      dailyReminder: false,
      streakReminder: true,
    };

    const preferences = emailNotificationPreferencesFromFormValues(formValues);

    expect(preferences).toEqual({
      unsubscribeAllOptionalEmails: false,
      categories: {
        weekly_summary: true,
        daily_reminder: false,
        streak_reminder: true,
      },
    });
    expect(
      emailNotificationPreferenceFormValuesFromPreferences(preferences),
    ).toEqual(formValues);
  });

  it('validates the strict form value contract', () => {
    const formValues = {
      unsubscribeAllOptionalEmails: false,
      weeklySummary: true,
      dailyReminder: false,
      streakReminder: true,
    };

    expect(
      emailNotificationPreferenceFormValuesSchema.parse(formValues),
    ).toEqual(formValues);
    expect(
      emailNotificationPreferenceFormValuesSchema.safeParse({
        ...formValues,
        extraField: true,
      }).success,
    ).toBe(false);
  });

  it('has copy for each email notification category', () => {
    expect(getEmailNotificationCategoryCopy('weekly_summary').label).toBe(
      'Weekly summary emails',
    );
    expect(getEmailNotificationCategoryCopy('daily_reminder').label).toBe(
      'Daily reminder emails',
    );
    expect(getEmailNotificationCategoryCopy('streak_reminder').label).toBe(
      'Streak reminder emails',
    );
  });
});
