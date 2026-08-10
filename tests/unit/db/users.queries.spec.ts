import type { DbClient } from '@/lib/db/types';

import { makeDbClient } from '../../fixtures/db-mocks';
import { buildUserFixture } from '../../fixtures/users';
import { createUser, getUserByAuthId } from '@/lib/db/queries/users';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
        user: buildUserFixture({
          id: 'internal-user-2',
          authUserId: 'auth-user-2',
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

    mockedGetDb.mockReturnValue(dbClient);

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

    const user = await getUserByAuthId('auth-user-3', explicitClient, {
      getRequestContext: mockedGetRequestContext,
      getDb: mockedGetDb,
      cleanupDbClient: mockedCleanupDbClient,
    });

    expect(user?.id).toBe('internal-user-3-db');
    expect(user?.analyticsTimezone).toBe('America/Chicago');
    expect(mockedGetRequestContext).not.toHaveBeenCalled();
    expect(mockedGetDb).not.toHaveBeenCalled();
  });

  it('ignores context user when not a valid DbUser', async () => {
    mockedGetRequestContext.mockReturnValue({
      correlationId: 'cid-1',
      user: {
        authUserId: 'auth-partial',
        id: 'internal-partial-only',
      },
    });

    const rows = [
      {
        user: buildUserFixture({
          id: 'full-user',
          authUserId: 'auth-partial',
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
    mockedGetDb.mockReturnValue(dbClient);

    const user = await getUserByAuthId('auth-partial', undefined, {
      getRequestContext: mockedGetRequestContext,
      getDb: mockedGetDb,
    });

    expect(user?.id).toBe('full-user');
    expect(user?.preferredAiModel).toBeNull();
    expect(user?.analyticsTimezone).toBe('UTC');
    expect(mockedGetDb).toHaveBeenCalledTimes(1);
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

    mockedGetDb.mockReturnValue(
      makeDbClient({ insert: insert as unknown as DbClient['insert'] }),
    );

    const user = await createUser(
      {
        authUserId: 'auth-user-4',
        email: 'user4@example.com',
        name: 'User Four',
      },
      undefined,
      { getDb: mockedGetDb },
    );

    expect(user?.id).toBe('internal-user-4');
    expect(mockedGetDb).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('defaults actor preference values when no preference row exists', async () => {
    mockedGetRequestContext.mockReturnValue(undefined);

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

    mockedGetDb.mockReturnValue(dbClient);

    const user = await getUserByAuthId('auth-user-5', undefined, {
      getRequestContext: mockedGetRequestContext,
      getDb: mockedGetDb,
      cleanupDbClient: mockedCleanupDbClient,
    });

    expect(user?.preferredAiModel).toBeNull();
    expect(user?.analyticsTimezone).toBe('UTC');
  });
});
