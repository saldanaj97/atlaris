import type { DbClient } from '@/lib/db/types';

import { makeDbClient } from '../../fixtures/db-mocks';
import { buildUserFixture } from '../../fixtures/users';
import {
  createUser,
  getOrCreateUser,
  getUserByAuthId,
} from '@/lib/db/queries/users';
import { describe, expect, it, vi } from 'vitest';

function makeRacingInsertClient(
  insertError: Error,
  existingRows: unknown[],
): { dbClient: DbClient; select: ReturnType<typeof vi.fn> } {
  const returning = vi.fn().mockRejectedValue(insertError);
  const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  const insert = vi.fn().mockReturnValue({ values });
  const where = vi.fn().mockResolvedValue(existingRows);
  const leftJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ leftJoin });
  const select = vi.fn().mockReturnValue({ from });
  return {
    dbClient: makeDbClient({
      insert: insert as unknown as DbClient['insert'],
      select: select as unknown as DbClient['select'],
    }),
    select,
  };
}

function emailUniqueViolation(): Error {
  return new Error('Failed query: insert into "users"', {
    cause: Object.assign(new Error('duplicate key value'), {
      code: '23505',
      constraint_name: 'users_email_unique',
    }),
  });
}

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

  it('returns the row a concurrent first sign-in inserted when the email insert races', async () => {
    const existing = buildUserFixture();
    const { dbClient } = makeRacingInsertClient(emailUniqueViolation(), [
      { user: existing, preferences: null },
    ]);

    const user = await getOrCreateUser(
      { authUserId: existing.authUserId, email: existing.email },
      dbClient,
    );

    expect(user?.id).toBe(existing.id);
  });

  it('re-raises an email violation when no row exists for the auth identity', async () => {
    const { authUserId, email } = buildUserFixture();
    const violation = emailUniqueViolation();
    const { dbClient } = makeRacingInsertClient(violation, []);

    await expect(getOrCreateUser({ authUserId, email }, dbClient)).rejects.toBe(
      violation,
    );
  });

  it('re-raises other insert failures without re-reading', async () => {
    const { authUserId, email } = buildUserFixture();
    const failure = new Error('connection terminated');
    const { dbClient, select } = makeRacingInsertClient(failure, []);

    await expect(getOrCreateUser({ authUserId, email }, dbClient)).rejects.toBe(
      failure,
    );
    expect(select).not.toHaveBeenCalled();
  });
});
