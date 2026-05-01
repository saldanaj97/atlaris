import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  requireCurrentUserRecord,
  withServerActionContext,
  withServerComponentContext,
} from '@/lib/api/auth';
import { getRequestContext } from '@/lib/api/context';
import { AuthError } from '@/lib/api/errors';
import { db as serviceDb } from '@/lib/db/service-role';
import { buildUserFixture } from '../../fixtures/users';
import { clearTestUser, setTestUser } from '../../helpers/auth';

const mocks = vi.hoisted(() => ({
  getUserByAuthId: vi.fn(),
  createUser: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/lib/db/queries/users', () => ({
  getUserByAuthId: mocks.getUserByAuthId,
  createUser: mocks.createUser,
}));

vi.mock('@/lib/auth/server', () => ({
  auth: {
    getSession: mocks.getSession,
  },
}));

const mockGetUserByAuthId = mocks.getUserByAuthId;
const mockCreateUser = mocks.createUser;
const mockGetSession = mocks.getSession;

describe('auth helpers', () => {
  beforeEach(() => {
    mockGetUserByAuthId.mockReset();
    mockCreateUser.mockReset();
    mockGetSession.mockReset();
    clearTestUser();
  });

  afterEach(() => {
    clearTestUser();
  });

  it('requireCurrentUserRecord throws if authentication is missing', async () => {
    await expect(requireCurrentUserRecord()).rejects.toBeInstanceOf(AuthError);
  });

  it('withServerComponentContext installs request context in test mode', async () => {
    const user = buildUserFixture({
      id: 'user_1',
      authUserId: 'auth_1',
      email: 'test@example.com',
      name: 'Test User',
    });

    setTestUser('auth_1');
    mockGetUserByAuthId.mockResolvedValue(user);

    await expect(
      withServerComponentContext(async (currentUser) => {
        const requestContext = getRequestContext();

        expect(currentUser).toEqual(user);
        expect(requestContext).toMatchObject({
          userId: 'auth_1',
          user: {
            id: 'user_1',
            authUserId: 'auth_1',
          },
        });
        expect(requestContext?.db).toBe(serviceDb);

        return currentUser.id;
      }),
    ).resolves.toBe('user_1');
  });

  it('withServerActionContext installs request context and service db in test mode', async () => {
    const user = buildUserFixture({
      id: 'user_2',
      authUserId: 'auth_2',
      email: 'action@example.com',
      name: 'Action User',
    });

    setTestUser('auth_2');
    mockGetUserByAuthId.mockResolvedValue(user);

    await expect(
      withServerActionContext(async (currentUser, db) => {
        const requestContext = getRequestContext();

        expect(currentUser).toEqual(user);
        expect(db).toBe(serviceDb);
        expect(requestContext).toMatchObject({
          userId: 'auth_2',
          user: {
            id: 'user_2',
            authUserId: 'auth_2',
          },
        });
        expect(requestContext?.db).toBe(serviceDb);

        return currentUser.authUserId;
      }),
    ).resolves.toBe('auth_2');
  });
});
