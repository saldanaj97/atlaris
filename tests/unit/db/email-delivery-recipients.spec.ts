import type { DbClient } from '@/lib/db/types';
import type { SQL } from 'drizzle-orm';

import { makeDbClient } from '../../fixtures/db-mocks';
import { listEmailDeliveryRecipients } from '@/lib/db/queries/email-delivery-recipients';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

const pgDialect = new PgDialect();

describe('listEmailDeliveryRecipients', () => {
  it('returns an empty page without querying when no categories are requested', async () => {
    const select = vi.fn();
    const dbClient = makeDbClient({
      select: select as unknown as DbClient['select'],
    });

    await expect(
      listEmailDeliveryRecipients({
        batchSize: 50,
        categories: [],
        dbClient,
      }),
    ).resolves.toEqual({ recipients: [], nextCursor: null });

    expect(select).not.toHaveBeenCalled();
  });

  it('filters unsubscribe-all and requested enabled categories before cursor pagination', async () => {
    let capturedWhere: SQL | undefined;
    const limit = vi.fn().mockResolvedValue([
      { userId: 'user-1', email: 'one@example.com' },
      { userId: 'user-2', email: 'two@example.com' },
    ]);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockImplementation((clause: SQL) => {
      capturedWhere = clause;
      return { orderBy };
    });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const dbClient = makeDbClient({
      select: select as unknown as DbClient['select'],
    });

    const result = await listEmailDeliveryRecipients({
      batchSize: 1,
      categories: ['daily_reminder', 'streak_reminder'],
      cursorUserId: '00000000-0000-0000-0000-000000000000',
      dbClient,
    });

    expect(result).toEqual({
      recipients: [{ userId: 'user-1', email: 'one@example.com' }],
      nextCursor: 'user-1',
    });
    expect(limit).toHaveBeenCalledWith(2);

    expect(capturedWhere).toBeDefined();
    const query = pgDialect.sqlToQuery(capturedWhere as SQL);
    expect(query.sql).toContain('user_email_notification_settings');
    expect(query.sql).toContain('unsubscribe_all_optional_emails');
    expect(query.sql).toContain('user_email_notification_preferences');
    expect(query.sql).toContain('"enabled"');
    expect(query.params).toEqual(
      expect.arrayContaining([
        'daily_reminder',
        'streak_reminder',
        '00000000-0000-0000-0000-000000000000',
      ]),
    );
  });
});
