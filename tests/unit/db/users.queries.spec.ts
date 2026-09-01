import type { DbClient } from '@/lib/db/types';

import { makeDbClient } from '../../fixtures/db-mocks';
import { buildUserFixture } from '../../fixtures/users';
import { createUser, getUserByAuthId } from '@/lib/db/queries/users';
import { describe, expect, it, vi } from 'vitest';

describe('users queries', () => {
  it('uses the explicit client for getUserByAuthId', async () => {
    const where = vi.fn().mockResolvedValue([
      {
        user: buildUserFixture({
          id: 'internal-user-3-db',
          authUserId: 'auth-user-3',
        }),
        preferences: {
          preferredAiModel: 'google/gemini-2.0-flash-exp:free',
          analyticsTimezone: 'America/Chicago',
        },
      },
    ]);
    const leftJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ leftJoin });
    const select = vi.fn().mockReturnValue({ from });
    const explicitClient = makeDbClient({
      select: select as unknown as DbClient['select'],
    });

    const user = await getUserByAuthId('auth-user-3', explicitClient);

    expect(user?.id).toBe('internal-user-3-db');
    expect(user?.analyticsTimezone).toBe('America/Chicago');
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('uses the explicit client for createUser', async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: 'internal-user-4',
        authUserId: 'auth-user-4',
        email: 'user4@example.com',
        name: 'User Four',
      },
    ]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    const dbClient = makeDbClient({
      insert: insert as unknown as DbClient['insert'],
    });

    const user = await createUser(
      {
        authUserId: 'auth-user-4',
        email: 'user4@example.com',
        name: 'User Four',
      },
      dbClient,
    );

    expect(user?.id).toBe('internal-user-4');
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('defaults actor preference values when no preference row exists', async () => {
    const rows = [
      {
        user: buildUserFixture({
          id: 'internal-user-5',
          authUserId: 'auth-user-5',
        }),
        preferences: null,
      },
    ];
    const dbClient = makeDbClient({
      select: (() => ({
        from: () => ({
          leftJoin: () => ({
            where: () => Promise.resolve(rows),
          }),
        }),
      })) as unknown as DbClient['select'],
    });

    const user = await getUserByAuthId('auth-user-5', dbClient);

    expect(user?.preferredAiModel).toBeNull();
    expect(user?.analyticsTimezone).toBe('UTC');
  });
});
