import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getCurrentUserRecordSafe,
  requireCurrentUserRecord,
} from '@/lib/api/auth';
import { AuthError } from '@/lib/api/errors';
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

  it('getCurrentUserRecordSafe returns null when authentication is missing', async () => {
    await expect(getCurrentUserRecordSafe()).resolves.toBeNull();
  });

  it('getCurrentUserRecordSafe returns the user when present in test mode', async () => {
    const user = buildUserFixture({
      id: 'user_1',
      authUserId: 'auth_1',
      email: 'test@example.com',
      name: 'Test User',
    });

    setTestUser('auth_1');
    mockGetUserByAuthId.mockResolvedValue(user);

    await expect(getCurrentUserRecordSafe()).resolves.toEqual(user);
  });
});
