import type { DbClient } from '@/lib/db/types';

import { makeDbClient } from '../../fixtures/db-mocks';
import {
  getUserPreferences,
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
