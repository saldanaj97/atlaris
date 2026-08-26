import type { DbClient } from '@/lib/db/types';
import type { SQL } from 'drizzle-orm';

import { makeDbClient } from '../../fixtures/db-mocks';
import {
  getEmailNotificationPreferences,
  getUserPreferences,
  saveEmailNotificationPreferences,
  upsertUserAnalyticsTimezone,
  upsertUserPreferredAiModel,
} from '@/lib/db/queries/user-preferences';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

describe('user preference queries', () => {
  it('returns defaults when no preference row exists', async () => {
    const dbClient = makeDbClient({
      select: (() => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      })) as unknown as DbClient['select'],
    });

    await expect(getUserPreferences('user-1', dbClient)).resolves.toEqual({
      preferredAiModel: null,
      analyticsTimezone: 'UTC',
    });
  });

  it('returns default email notification preferences when no rows exist', async () => {
    const where = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const dbClient = makeDbClient({
      select: select as unknown as DbClient['select'],
    });

    await expect(
      getEmailNotificationPreferences('user-1', dbClient),
    ).resolves.toEqual({
      unsubscribeAllOptionalEmails: false,
      categories: {
        weekly_summary: false,
        daily_reminder: false,
        streak_reminder: false,
      },
    });
  });

  it('saves email notification preferences transactionally', async () => {
    const currentUnsubscribedAt = new Date('2026-07-03T12:00:00.000Z');
    const execute = vi
      .fn()
      .mockResolvedValueOnce([{ unsubscribe_all_optional_emails: true }])
      .mockResolvedValueOnce([
        { category: 'weekly_summary', enabled: false },
        { category: 'daily_reminder', enabled: true },
        { category: 'streak_reminder', enabled: false },
      ]);

    const tx = {
      select: vi.fn(() => ({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                category: 'weekly_summary',
                enabled: true,
                unsubscribedAt: null,
              },
              {
                category: 'streak_reminder',
                enabled: false,
                unsubscribedAt: currentUnsubscribedAt,
              },
            ]),
        }),
      })),
      execute,
    };
    const transaction = vi.fn((run) => run(tx));
    const dbClient = makeDbClient({
      execute: vi.fn().mockResolvedValue([]) as unknown as DbClient['execute'],
      transaction: transaction as unknown as DbClient['transaction'],
    });

    await expect(
      saveEmailNotificationPreferences(
        'user-1',
        {
          unsubscribeAllOptionalEmails: true,
          categories: {
            weekly_summary: false,
            daily_reminder: true,
            streak_reminder: false,
          },
        },
        dbClient,
      ),
    ).resolves.toEqual({
      unsubscribeAllOptionalEmails: true,
      categories: {
        weekly_summary: false,
        daily_reminder: true,
        streak_reminder: false,
      },
    });

    expect(transaction).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledTimes(2);

    const dialect = new PgDialect();
    const settingsQuery = dialect.sqlToQuery(execute.mock.calls[0]?.[0] as SQL);
    const categoriesQuery = dialect.sqlToQuery(
      execute.mock.calls[1]?.[0] as SQL,
    );
    expect(settingsQuery.sql).not.toContain('"created_at"');
    expect(categoriesQuery.sql).not.toContain('"created_at"');
  });

  it('throws when email notification category writes are incomplete', async () => {
    const tx = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      })),
      execute: vi
        .fn()
        .mockResolvedValueOnce([{ unsubscribe_all_optional_emails: false }])
        .mockResolvedValueOnce([{ category: 'weekly_summary', enabled: true }]),
    };
    const dbClient = makeDbClient({
      execute: vi.fn().mockResolvedValue([]) as unknown as DbClient['execute'],
      transaction: vi.fn((run) =>
        run(tx),
      ) as unknown as DbClient['transaction'],
    });

    await expect(
      saveEmailNotificationPreferences(
        'user-1',
        {
          unsubscribeAllOptionalEmails: false,
          categories: {
            weekly_summary: true,
            daily_reminder: false,
            streak_reminder: false,
          },
        },
        dbClient,
      ),
    ).rejects.toThrow('Failed to persist email notification category rows.');
  });

  it('upserts preferred AI model on the user preference row', async () => {
    const execute = vi.fn().mockResolvedValue([
      {
        preferred_ai_model: 'google/gemini-2.0-flash-exp:free',
        analytics_timezone: 'UTC',
      },
    ]);

    const dbClient = makeDbClient({
      execute: execute as unknown as DbClient['execute'],
    });

    const result = await upsertUserPreferredAiModel(
      'user-1',
      'google/gemini-2.0-flash-exp:free',
      dbClient,
    );

    expect(result?.preferredAiModel).toBe('google/gemini-2.0-flash-exp:free');
    expect(execute).toHaveBeenCalledOnce();

    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]?.[0] as SQL);
    expect(query.sql).toContain('"preferred_ai_model"');
    expect(query.sql).toContain('ON CONFLICT');
    expect(query.sql).not.toContain('"created_at"');
    expect(query.sql).not.toContain('preferred_regeneration_ai_model');
    expect(query.sql).not.toContain('preferred_lesson_ai_model');
  });

  it('upserts analytics timezone on the user preference row', async () => {
    const execute = vi.fn().mockResolvedValue([
      {
        preferred_ai_model: null,
        analytics_timezone: 'America/Chicago',
      },
    ]);

    const dbClient = makeDbClient({
      execute: execute as unknown as DbClient['execute'],
    });

    const result = await upsertUserAnalyticsTimezone(
      'user-1',
      'America/Chicago',
      dbClient,
    );

    expect(result?.analyticsTimezone).toBe('America/Chicago');
    expect(execute).toHaveBeenCalledOnce();

    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]?.[0] as SQL);
    expect(query.sql).toContain('"analytics_timezone"');
    expect(query.sql).toContain('ON CONFLICT');
    expect(query.sql).not.toContain('"created_at"');
    expect(query.sql).not.toContain('preferred_regeneration_ai_model');
    expect(query.sql).not.toContain('preferred_lesson_ai_model');
  });
});
