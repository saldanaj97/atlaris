import { ensureUser } from '../../helpers/db/users';
import {
  getEmailNotificationPreferences,
  getUserPreferences,
  saveEmailNotificationPreferences,
} from '@/lib/db/queries/user-preferences';
import { resolveEffectiveEmailPreferences } from '@/shared/notifications/email-preferences';
import {
  userEmailNotificationPreferences,
  userEmailNotificationSettings,
  userPreferences,
  users,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

describe('user preference persistence', () => {
  it('returns default user preferences when no row exists', async () => {
    const userId = await ensureUser({
      authUserId: 'preference_defaults',
      email: 'preference-defaults@example.com',
    });

    await expect(getUserPreferences(userId, db)).resolves.toEqual({
      preferredAiModel: null,
      analyticsTimezone: 'UTC',
    });
  });

  it('uses database defaults for notification settings rows', async () => {
    const userId = await ensureUser({
      authUserId: 'notification_defaults',
      email: 'notification-defaults@example.com',
    });

    const [settings] = await db
      .insert(userEmailNotificationSettings)
      .values({ userId })
      .returning();
    const [categoryPreference] = await db
      .insert(userEmailNotificationPreferences)
      .values({ userId, category: 'weekly_summary' })
      .returning();

    expect(settings?.unsubscribeAllOptionalEmails).toBe(false);
    expect(categoryPreference).toMatchObject({
      category: 'weekly_summary',
      enabled: false,
      unsubscribedAt: null,
    });
  });

  it('round trips email notification preferences with unsubscribe-all masking', async () => {
    const userId = await ensureUser({
      authUserId: 'notification_round_trip',
      email: 'notification-round-trip@example.com',
    });

    await expect(getEmailNotificationPreferences(userId, db)).resolves.toEqual({
      unsubscribeAllOptionalEmails: false,
      categories: {
        weekly_summary: false,
        daily_reminder: false,
        streak_reminder: false,
      },
    });

    const savedPreferences = await saveEmailNotificationPreferences(
      userId,
      {
        unsubscribeAllOptionalEmails: true,
        categories: {
          weekly_summary: true,
          daily_reminder: true,
          streak_reminder: false,
        },
      },
      db,
    );

    expect(savedPreferences).toEqual({
      unsubscribeAllOptionalEmails: true,
      categories: {
        weekly_summary: true,
        daily_reminder: true,
        streak_reminder: false,
      },
    });
    expect(resolveEffectiveEmailPreferences(savedPreferences!)).toEqual({
      weekly_summary: false,
      daily_reminder: false,
      streak_reminder: false,
    });
    await expect(getEmailNotificationPreferences(userId, db)).resolves.toEqual(
      savedPreferences,
    );
  });

  it('cascades preference rows when a user is deleted', async () => {
    const userId = await ensureUser({
      authUserId: 'preference_cascade',
      email: 'preference-cascade@example.com',
    });

    await db
      .insert(userPreferences)
      .values({ userId, analyticsTimezone: 'America/Chicago' });
    await db
      .insert(userEmailNotificationSettings)
      .values({ userId, unsubscribeAllOptionalEmails: true });
    await db
      .insert(userEmailNotificationPreferences)
      .values({ userId, category: 'daily_reminder', enabled: true });

    await db.delete(users).where(eq(users.id, userId));

    const [preferenceRow] = await db
      .select({ userId: userPreferences.userId })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    const [settingsRow] = await db
      .select({ userId: userEmailNotificationSettings.userId })
      .from(userEmailNotificationSettings)
      .where(eq(userEmailNotificationSettings.userId, userId));
    const [categoryRow] = await db
      .select({ userId: userEmailNotificationPreferences.userId })
      .from(userEmailNotificationPreferences)
      .where(eq(userEmailNotificationPreferences.userId, userId));

    expect(preferenceRow).toBeUndefined();
    expect(settingsRow).toBeUndefined();
    expect(categoryRow).toBeUndefined();
  });
});
