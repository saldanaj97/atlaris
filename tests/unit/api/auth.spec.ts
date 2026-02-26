import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requireCurrentUserRecord } from '@/lib/api/auth';
import { AuthError } from '@/lib/api/errors';
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
});
