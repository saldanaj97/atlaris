import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createUser,
  getUserByAuthId,
  updateUserPreferredAiModel,
} from '@/lib/db/queries/users';
import type { getDb } from '@/lib/db/runtime';
import { buildUserFixture } from '../../fixtures/users';

const mockedGetRequestContext = vi.fn();
const mockedGetDb = vi.fn();
const mockedCleanupDbClient = vi.fn().mockResolvedValue(undefined);

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
  });

  it('uses injected getDb when createUser has no explicit client', async () => {
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

    mockedGetDb.mockReturnValue({
      insert,
    } as unknown as ReturnType<typeof getDb>);

    const user = await createUser(
      {
        authUserId: 'auth-user-4',
        email: 'user4@example.com',
        name: 'User Four',
      },
      undefined,
      { getDb: mockedGetDb }
    );

    expect(user?.id).toBe('internal-user-4');
    expect(mockedGetDb).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('uses injected getDb when updateUserPreferredAiModel has no explicit client', async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: 'internal-user-5',
        authUserId: 'auth-user-5',
        preferredAiModel: 'google/gemini-2.0-flash-exp:free',
      },
    ]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });

    mockedGetDb.mockReturnValue({
      update,
    } as unknown as ReturnType<typeof getDb>);

    const user = await updateUserPreferredAiModel(
      'internal-user-5',
      'google/gemini-2.0-flash-exp:free',
      undefined,
      { getDb: mockedGetDb }
    );

    expect(user?.id).toBe('internal-user-5');
    expect(mockedGetDb).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
