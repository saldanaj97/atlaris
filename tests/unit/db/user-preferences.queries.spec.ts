import type { DbClient } from '@/lib/db/types';

import { makeDbClient } from '../../fixtures/db-mocks';
import {
  getEmailNotificationPreferences,
  getUserPreferences,
  saveEmailNotificationPreferences,
  upsertUserAnalyticsTimezone,
  upsertUserPreferredAiModel,
} from '@/lib/db/queries/user-preferences';
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
    const insertedValues: unknown[] = [];
    const currentUnsubscribedAt = new Date('2026-07-03T12:00:00.000Z');

    function insertReturning(rows: unknown[]) {
      return {
        values: vi.fn((payload: unknown) => {
          insertedValues.push(payload);
          return {
            onConflictDoUpdate: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue(rows),
            })),
          };
        }),
      };
    }

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
      insert: vi
        .fn()
        .mockReturnValueOnce(
          insertReturning([{ unsubscribeAllOptionalEmails: true }]),
        )
        .mockReturnValueOnce(
          insertReturning([
            { category: 'weekly_summary', enabled: false },
            { category: 'daily_reminder', enabled: true },
            { category: 'streak_reminder', enabled: false },
          ]),
        ),
      execute: vi.fn(),
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
    expect(insertedValues).toHaveLength(2);
    expect(insertedValues[0]).toMatchObject({
      userId: 'user-1',
      unsubscribeAllOptionalEmails: true,
    });
    const categoryValues = insertedValues[1] as Array<{
      userId: string;
      category: string;
      enabled: boolean;
      unsubscribedAt: unknown;
    }>;
    expect(categoryValues).toHaveLength(3);
    expect(categoryValues[0]).toMatchObject({
      userId: 'user-1',
      category: 'weekly_summary',
      enabled: false,
    });
    expect(categoryValues[0]?.unsubscribedAt).not.toBeNull();
    expect(categoryValues[1]).toMatchObject({
      userId: 'user-1',
      category: 'daily_reminder',
      enabled: true,
      unsubscribedAt: null,
    });
    expect(categoryValues[2]).toMatchObject({
      userId: 'user-1',
      category: 'streak_reminder',
      enabled: false,
      unsubscribedAt: currentUnsubscribedAt,
    });
  });

  it('throws when email notification category writes are incomplete', async () => {
    function insertReturning(rows: unknown[]) {
      return {
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue(rows),
          })),
        })),
      };
    }

    const tx = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      })),
      insert: vi
        .fn()
        .mockReturnValueOnce(
          insertReturning([{ unsubscribeAllOptionalEmails: false }]),
        )
        .mockReturnValueOnce(
          insertReturning([{ category: 'weekly_summary', enabled: true }]),
        ),
      execute: vi.fn(),
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
    const returning = vi.fn().mockResolvedValue([
      {
        preferredAiModel: 'google/gemini-2.0-flash-exp:free',
        analyticsTimezone: 'UTC',
      },
    ]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = vi.fn().mockReturnValue({ values });

    const dbClient = makeDbClient({
      insert: insert as unknown as DbClient['insert'],
    });

    const result = await upsertUserPreferredAiModel(
      'user-1',
      'google/gemini-2.0-flash-exp:free',
      dbClient,
    );

    expect(result?.preferredAiModel).toBe('google/gemini-2.0-flash-exp:free');
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        preferredAiModel: 'google/gemini-2.0-flash-exp:free',
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledOnce();
  });

  it('upserts analytics timezone on the user preference row', async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        preferredAiModel: null,
        analyticsTimezone: 'America/Chicago',
      },
    ]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = vi.fn().mockReturnValue({ values });

    const dbClient = makeDbClient({
      insert: insert as unknown as DbClient['insert'],
    });

    const result = await upsertUserAnalyticsTimezone(
      'user-1',
      'America/Chicago',
      dbClient,
    );

    expect(result?.analyticsTimezone).toBe('America/Chicago');
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        analyticsTimezone: 'America/Chicago',
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledOnce();
  });
});
