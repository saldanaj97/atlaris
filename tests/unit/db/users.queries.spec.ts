import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildUserFixture } from '../../fixtures/users';
import { getUserByAuthId } from '@/lib/db/queries/users';
import { getDb } from '@/lib/db/runtime';

const mockedGetRequestContext = vi.fn();
const mockedGetDb = vi.fn();
const mockedCleanupDbClient = vi.fn();

describe('users queries optimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user from request context when auth id matches', async () => {
    const fixtureUser = buildUserFixture();

    mockedGetRequestContext.mockReturnValue({
      correlationId: 'cid-1',
      user: fixtureUser,
    });

    const user = await getUserByAuthId(fixtureUser.authUserId, undefined, {
      getRequestContext: mockedGetRequestContext,
      getDb: mockedGetDb,
      cleanupDbClient: mockedCleanupDbClient,
    });

    expect(user?.id).toBe(fixtureUser.id);
    expect(mockedGetDb).not.toHaveBeenCalled();
    expect(mockedCleanupDbClient).not.toHaveBeenCalled();
  });

  it('falls back to database query when context user is absent', async () => {
    mockedGetRequestContext.mockReturnValue(undefined);

    const rows = [
      {
        id: 'internal-user-2',
        authUserId: 'auth-user-2',
      },
    ];
    const dbClient = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve(rows),
        }),
      }),
    };

    mockedGetDb.mockReturnValue(
      dbClient as unknown as ReturnType<typeof getDb>
    );

    const user = await getUserByAuthId('auth-user-2', undefined, {
      getRequestContext: mockedGetRequestContext,
      getDb: mockedGetDb,
      cleanupDbClient: mockedCleanupDbClient,
    });

    expect(user?.id).toBe('internal-user-2');
    expect(mockedGetDb).toHaveBeenCalledTimes(1);
    expect(mockedCleanupDbClient).toHaveBeenCalledWith(dbClient);
  });

  it('bypasses request context cache when explicit db client provided', async () => {
    const where = vi.fn().mockResolvedValue([
      {
        id: 'internal-user-3-db',
        authUserId: 'auth-user-3',
      },
    ]);
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const explicitClient = { select } as unknown as ReturnType<typeof getDb>;

    const user = await getUserByAuthId('auth-user-3', explicitClient, {
      getRequestContext: mockedGetRequestContext,
      getDb: mockedGetDb,
      cleanupDbClient: mockedCleanupDbClient,
    });

    expect(user?.id).toBe('internal-user-3-db');
    expect(mockedGetRequestContext).not.toHaveBeenCalled();
    expect(mockedGetDb).not.toHaveBeenCalled();
    expect(mockedCleanupDbClient).not.toHaveBeenCalled();
  });
});
