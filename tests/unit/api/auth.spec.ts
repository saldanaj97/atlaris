import { buildUserFixture } from '../../fixtures/users';
import { clearTestUser, setTestUser } from '../../helpers/auth';
import {
  requireCurrentUserRecord,
  withServerActionContext,
  withServerComponentContext,
} from '@/lib/api/auth';
import { getRequestContext } from '@/lib/api/context';
import { AuthError } from '@/lib/api/errors';
import { db as serviceDb } from '@supabase/service-role';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('requireCurrentUserRecord returns an existing user row', async () => {
    const user = buildUserFixture({
      id: 'user_existing',
      authUserId: 'auth_existing',
      email: 'existing@example.com',
    });

    setTestUser('auth_existing');
    mockGetUserByAuthId.mockResolvedValue(user);

    await expect(requireCurrentUserRecord()).resolves.toEqual(user);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('requireCurrentUserRecord provisions a missing user from Clerk session data', async () => {
    const created = buildUserFixture({
      id: 'user_created',
      authUserId: 'auth_created',
      email: 'created@example.com',
      name: 'Created User',
    });

    setTestUser('auth_created');
    mockGetUserByAuthId.mockResolvedValue(null);
    mockGetSession.mockResolvedValue({
      data: {
        user: {
          id: 'auth_created',
          email: 'created@example.com',
          name: 'Created User',
        },
      },
    });
    mockCreateUser.mockResolvedValue(created);

    await expect(requireCurrentUserRecord()).resolves.toEqual(created);
    expect(mockCreateUser).toHaveBeenCalledWith(
      {
        authUserId: 'auth_created',
        email: 'created@example.com',
        name: 'Created User',
      },
      undefined,
    );
  });

  it('requireCurrentUserRecord fails closed when Clerk user data is unavailable', async () => {
    setTestUser('auth_missing_user');
    mockGetUserByAuthId.mockResolvedValue(null);
    mockGetSession.mockResolvedValue({ data: null });

    await expect(requireCurrentUserRecord()).rejects.toBeInstanceOf(AuthError);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('requireCurrentUserRecord fails closed when the Clerk user has no email', async () => {
    setTestUser('auth_missing_email');
    mockGetUserByAuthId.mockResolvedValue(null);
    mockGetSession.mockResolvedValue({
      data: {
        user: {
          id: 'auth_missing_email',
          email: null,
          name: 'Missing Email',
        },
      },
    });

    await expect(requireCurrentUserRecord()).rejects.toBeInstanceOf(AuthError);
    expect(mockCreateUser).not.toHaveBeenCalled();
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
