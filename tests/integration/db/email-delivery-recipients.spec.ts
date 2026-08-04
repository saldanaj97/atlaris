import { listEmailDeliveryRecipients } from '@/lib/db/queries/email-delivery-recipients';
import {
  userEmailNotificationPreferences,
  userEmailNotificationSettings,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
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

    const result = await listEmailDeliveryRecipients({
      batchSize: 1,
      categories: ['daily_reminder'],
      dbClient: db,
    });

    expect(result.recipients).toEqual([
      {
        userId: enabledUserId,
        email: buildTestEmail(enabledAuthUserId),
      },
    ]);
    expect(result.nextCursor).toBeNull();
  });
});
