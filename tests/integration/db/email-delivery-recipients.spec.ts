import {
  isEmailDeliveryRecipientCurrent,
  listEmailDeliveryRecipients,
} from '@/lib/db/queries/email-delivery-recipients';
import {
  userEmailNotificationPreferences,
  userEmailNotificationSettings,
  users,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

describe('email delivery recipient query', () => {
  it('filters by enabled categories and unsubscribe-all before pagination', async () => {
    const enabledAuthUserId = buildTestAuthUserId('email-recipient-enabled');
    const disabledAuthUserId = buildTestAuthUserId('email-recipient-disabled');
    const unsubscribedAuthUserId = buildTestAuthUserId(
      'email-recipient-unsubscribed',
    );
    const [enabledUserId, disabledUserId, unsubscribedUserId] =
      await Promise.all([
        ensureUser({
          authUserId: enabledAuthUserId,
          email: buildTestEmail(enabledAuthUserId),
        }),
        ensureUser({
          authUserId: disabledAuthUserId,
          email: buildTestEmail(disabledAuthUserId),
        }),
        ensureUser({
          authUserId: unsubscribedAuthUserId,
          email: buildTestEmail(unsubscribedAuthUserId),
        }),
      ]);

    await db.insert(userEmailNotificationPreferences).values([
      { userId: enabledUserId, category: 'daily_reminder', enabled: true },
      { userId: disabledUserId, category: 'daily_reminder', enabled: false },
      {
        userId: unsubscribedUserId,
        category: 'daily_reminder',
        enabled: true,
      },
    ]);
    await db.insert(userEmailNotificationSettings).values({
      userId: unsubscribedUserId,
      unsubscribeAllOptionalEmails: true,
    });
    const clerkUserUpdatedAt = new Date('2026-08-05T12:00:00.000Z');
    await db
      .update(users)
      .set({ clerkUserUpdatedAt })
      .where(eq(users.id, enabledUserId));

    const result = await listEmailDeliveryRecipients({
      batchSize: 1,
      categories: ['daily_reminder'],
      dbClient: db,
    });

    expect(result.recipients).toEqual([
      {
        userId: enabledUserId,
        email: buildTestEmail(enabledAuthUserId),
        clerkUserUpdatedAt,
      },
    ]);
    expect(result.nextCursor).toBeNull();
  });

  it('excludes unprojected and tombstoned identities from scheduled delivery', async () => {
    const validAuthUserId = buildTestAuthUserId('email-recipient-projected');
    const unprojectedAuthUserId = buildTestAuthUserId(
      'email-recipient-unprojected',
    );
    const tombstonedAuthUserId = buildTestAuthUserId(
      'email-recipient-tombstoned',
    );
    const [validUserId, unprojectedUserId, tombstonedUserId] =
      await Promise.all([
        ensureUser({
          authUserId: validAuthUserId,
          email: buildTestEmail(validAuthUserId),
        }),
        ensureUser({
          authUserId: unprojectedAuthUserId,
          email: buildTestEmail(unprojectedAuthUserId),
        }),
        ensureUser({
          authUserId: tombstonedAuthUserId,
          email: buildTestEmail(tombstonedAuthUserId),
        }),
      ]);
    const clerkUserUpdatedAt = new Date('2026-08-05T12:00:00.000Z');

    await db
      .update(users)
      .set({ clerkUserUpdatedAt })
      .where(eq(users.id, validUserId));
    await db
      .update(users)
      .set({
        clerkUserUpdatedAt,
        clerkDeletedAt: new Date('2026-08-05T12:01:00.000Z'),
      })
      .where(eq(users.id, tombstonedUserId));
    await db.insert(userEmailNotificationPreferences).values([
      { userId: validUserId, category: 'daily_reminder', enabled: true },
      {
        userId: unprojectedUserId,
        category: 'daily_reminder',
        enabled: true,
      },
      {
        userId: tombstonedUserId,
        category: 'daily_reminder',
        enabled: true,
      },
    ]);

    const result = await listEmailDeliveryRecipients({
      batchSize: 10,
      categories: ['daily_reminder'],
      dbClient: db,
    });

    expect(result.recipients).toEqual([
      {
        userId: validUserId,
        email: buildTestEmail(validAuthUserId),
        clerkUserUpdatedAt,
      },
    ]);
  });

  it('fences delivery against the current Clerk identity projection', async () => {
    const authUserId = buildTestAuthUserId('email-recipient-fence');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const clerkUserUpdatedAt = new Date('2026-08-05T12:00:00.000Z');
    await db
      .update(users)
      .set({ clerkUserUpdatedAt })
      .where(eq(users.id, userId));
    const args = {
      userId,
      email: buildTestEmail(authUserId),
      clerkUserUpdatedAt,
      dbClient: db,
    };

    await expect(isEmailDeliveryRecipientCurrent(args)).resolves.toBe(true);

    await db
      .update(users)
      .set({
        email: 'new-address@example.com',
        clerkUserUpdatedAt: new Date('2026-08-05T12:01:00.000Z'),
      })
      .where(eq(users.id, userId));
    await expect(isEmailDeliveryRecipientCurrent(args)).resolves.toBe(false);

    await db
      .update(users)
      .set({ clerkDeletedAt: new Date('2026-08-05T12:02:00.000Z') })
      .where(eq(users.id, userId));
    await expect(isEmailDeliveryRecipientCurrent(args)).resolves.toBe(false);
  });
});
