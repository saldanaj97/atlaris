import { truncateAll } from '../helpers/db/truncate';
import {
  cleanupTrackedRlsClients,
  createAnonRlsDb,
  createRlsDbForUser,
} from '../helpers/rls';
import { expectRlsViolation } from './rls-test-helpers';
import {
  userEmailNotificationPreferences,
  userEmailNotificationSettings,
  userPreferences,
  users,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('user preference RLS policies', () => {
  beforeEach(async () => {
    await cleanupTrackedRlsClients();
    await truncateAll();
  });

  afterEach(async () => {
    await cleanupTrackedRlsClients();
  });

  it('scopes preference rows to the authenticated owner', async () => {
    const [owner] = await db
      .insert(users)
      .values({
        authUserId: 'preferences_owner',
        email: 'preferences-owner@test.com',
      })
      .returning({ id: users.id });
    const [other] = await db
      .insert(users)
      .values({
        authUserId: 'preferences_other',
        email: 'preferences-other@test.com',
      })
      .returning({ id: users.id });

    await db.insert(userPreferences).values([
      { userId: owner.id, analyticsTimezone: 'America/Chicago' },
      { userId: other.id, analyticsTimezone: 'UTC' },
    ]);
    await db.insert(userEmailNotificationSettings).values([
      { userId: owner.id, unsubscribeAllOptionalEmails: false },
      { userId: other.id, unsubscribeAllOptionalEmails: true },
    ]);
    await db.insert(userEmailNotificationPreferences).values([
      { userId: owner.id, category: 'weekly_summary', enabled: false },
      { userId: other.id, category: 'weekly_summary', enabled: true },
    ]);

    const ownerDb = await createRlsDbForUser('preferences_owner');

    const visiblePreferences = await ownerDb.select().from(userPreferences);
    expect(visiblePreferences).toHaveLength(1);
    expect(visiblePreferences[0]?.userId).toBe(owner.id);

    const updatedPreferences = await ownerDb
      .update(userPreferences)
      .set({ analyticsTimezone: 'America/New_York' })
      .where(eq(userPreferences.userId, owner.id))
      .returning({ analyticsTimezone: userPreferences.analyticsTimezone });
    expect(updatedPreferences[0]?.analyticsTimezone).toBe('America/New_York');

    const crossTenantUpdate = await ownerDb
      .update(userEmailNotificationSettings)
      .set({ unsubscribeAllOptionalEmails: true })
      .where(eq(userEmailNotificationSettings.userId, other.id))
      .returning({ userId: userEmailNotificationSettings.userId });
    expect(crossTenantUpdate).toHaveLength(0);

    await expectRlsViolation(() =>
      ownerDb.insert(userEmailNotificationPreferences).values({
        userId: other.id,
        category: 'daily_reminder',
        enabled: true,
      }),
    );

    await expectRlsViolation(() =>
      ownerDb
        .update(userPreferences)
        .set({ createdAt: new Date() })
        .where(eq(userPreferences.userId, owner.id)),
    );

    await expectRlsViolation(() =>
      ownerDb.insert(userEmailNotificationPreferences).values({
        userId: owner.id,
        category: 'daily_reminder',
        enabled: true,
        createdAt: new Date(),
      }),
    );
  });

  it('denies anonymous access to preference tables', async () => {
    const [owner] = await db
      .insert(users)
      .values({
        authUserId: 'preferences_anon_owner',
        email: 'preferences-anon-owner@test.com',
      })
      .returning({ id: users.id });
    await db
      .insert(userEmailNotificationSettings)
      .values({ userId: owner.id, unsubscribeAllOptionalEmails: false });

    const anonDb = await createAnonRlsDb();

    await expectRlsViolation(() =>
      anonDb.select().from(userEmailNotificationSettings),
    );
    await expectRlsViolation(() =>
      anonDb
        .insert(userPreferences)
        .values({ userId: owner.id, analyticsTimezone: 'UTC' }),
    );
  });
});
