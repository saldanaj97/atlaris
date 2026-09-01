import { buildUserFixture } from '../../fixtures/users';
import { clearTestUser, setTestUser } from '../../helpers/auth';
import {
  runServerComponentContext,
  withServerActionContext,
} from '@/lib/api/auth';
import { getRequestContext } from '@/lib/api/context';
import { db as serviceDb } from '@supabase/service-role';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUserByAuthId: vi.fn(),
  provisionUser: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/lib/db/queries/users', () => ({
  getUserByAuthId: mocks.getUserByAuthId,
}));

vi.mock('@/features/auth/user-provisioning', () => ({
  provisionUserFromVerifiedAuthSession: mocks.provisionUser,
}));

vi.mock('@/lib/auth/server', () => ({
  auth: {
    getSession: mocks.getSession,
  },
}));

const mockGetUserByAuthId = mocks.getUserByAuthId;

describe('auth helpers', () => {
  beforeEach(() => {
    vi.stubEnv('LOCAL_PRODUCT_TESTING', 'false');
    mockGetUserByAuthId.mockReset();
    mocks.provisionUser.mockReset();
    mocks.getSession.mockReset();
    clearTestUser();
  });

  afterEach(() => {
    clearTestUser();
  });

  it('runServerComponentContext installs request context in test mode', async () => {
    const user = buildUserFixture({
      id: 'user_1',
      authUserId: 'auth_1',
      email: 'test@example.com',
      name: 'Test User',
    });

    setTestUser('auth_1');
    mockGetUserByAuthId.mockResolvedValue(user);

    await expect(
      runServerComponentContext(async (currentUser) => {
        const requestContext = getRequestContext();

        expect(currentUser).toEqual(user);
        expect(requestContext?.userId).toBe('auth_1');
        expect(requestContext?.user).toEqual(user);
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
        expect(requestContext?.userId).toBe('auth_2');
        expect(requestContext?.user).toEqual(user);
        expect(requestContext?.db).toBe(serviceDb);

        return currentUser.authUserId;
      }),
    ).resolves.toBe('auth_2');
  });
});
