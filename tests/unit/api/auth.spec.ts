import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getOrCreateCurrentUserRecord,
  requireCurrentUserRecord,
} from '@/lib/api/auth';
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

  it('creates a user when none exists yet', async () => {
    const authUserId = 'auth-create';
    setTestUser(authUserId);
    mockGetUserByAuthId.mockResolvedValue(undefined);

    mockGetSession.mockResolvedValue({
      data: {
        user: {
          id: authUserId,
          email: 'create@example.com',
          name: 'Create Record',
        },
      },
    });

    const createdRecord = {
      id: 'db-create',
      authUserId,
      email: 'create@example.com',
      name: 'Create Record',
    };
    mockCreateUser.mockResolvedValue(createdRecord);

    const result = await getOrCreateCurrentUserRecord();

    expect(result).toEqual(createdRecord);
    expect(mockCreateUser).toHaveBeenCalledWith({
      authUserId,
      email: 'create@example.com',
      name: 'Create Record',
    });
    expect(mockGetSession).toHaveBeenCalled();
  });

  it('returns the existing user without calling Auth again', async () => {
    const authUserId = 'auth-existing';
    setTestUser(authUserId);
    const existingRecord = {
      id: 'db-existing',
      authUserId,
      email: 'existing@example.com',
      name: 'Existing User',
    };
    mockGetUserByAuthId.mockResolvedValue(existingRecord);

    const result = await getOrCreateCurrentUserRecord();

    expect(result).toEqual(existingRecord);
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('returns null when no authenticated user is present', async () => {
    const result = await getOrCreateCurrentUserRecord();
    expect(result).toBeNull();
    expect(mockGetUserByAuthId).not.toHaveBeenCalled();
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('requireCurrentUserRecord throws if authentication is missing', async () => {
    await expect(requireCurrentUserRecord()).rejects.toBeInstanceOf(AuthError);
  });
});
