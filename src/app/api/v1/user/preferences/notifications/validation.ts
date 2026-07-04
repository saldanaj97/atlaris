import { z } from 'zod';

export const updateEmailNotificationPreferencesSchema = z.strictObject({
  unsubscribeAllOptionalEmails: z.boolean(),
  weeklySummary: z.boolean(),
  dailyReminder: z.boolean(),
  streakReminder: z.boolean(),
});
