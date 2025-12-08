import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getOrCreateCurrentUserRecord,
  requireCurrentUserRecord,
} from '@/lib/api/auth';
import { AuthError } from '@/lib/api/errors';
import { clearTestUser, setTestUser } from '../../helpers/auth';

const mocks = vi.hoisted(() => ({
  getUserByClerkId: vi.fn(),
  createUser: vi.fn(),
  currentUser: vi.fn(),
}));

vi.mock('@/lib/db/queries/users', () => ({
  getUserByClerkId: mocks.getUserByClerkId,
  createUser: mocks.createUser,
}));

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: mocks.currentUser,
}));

const mockGetUserByClerkId = mocks.getUserByClerkId;
const mockCreateUser = mocks.createUser;
const mockCurrentUser = mocks.currentUser;

describe('auth helpers', () => {
  beforeEach(() => {
    mockGetUserByClerkId.mockReset();
    mockCreateUser.mockReset();
    mockCurrentUser.mockReset();
    clearTestUser();
  });

  afterEach(() => {
    clearTestUser();
  });

  it('creates a user when none exists yet', async () => {
    const clerkUserId = 'clerk-create';
    setTestUser(clerkUserId);
    mockGetUserByClerkId.mockResolvedValue(undefined);

    mockCurrentUser.mockResolvedValue({
      id: clerkUserId,
      emailAddresses: [{ id: 'primary', emailAddress: 'create@example.com' }],
      primaryEmailAddressId: 'primary',
      firstName: 'Create',
      lastName: 'Record',
      fullName: 'Create Record',
    });

    const createdRecord = {
      id: 'db-create',
      clerkUserId,
      email: 'create@example.com',
      name: 'Create Record',
    };
    mockCreateUser.mockResolvedValue(createdRecord);

    const result = await getOrCreateCurrentUserRecord();

    expect(result).toEqual(createdRecord);
    expect(mockCreateUser).toHaveBeenCalledWith({
      clerkUserId,
      email: 'create@example.com',
      name: 'Create Record',
    });
    expect(mockCurrentUser).toHaveBeenCalled();
  });

  it('returns the existing user without calling Clerk again', async () => {
    const clerkUserId = 'clerk-existing';
    setTestUser(clerkUserId);
    const existingRecord = {
      id: 'db-existing',
      clerkUserId,
      email: 'existing@example.com',
      name: 'Existing User',
    };
    mockGetUserByClerkId.mockResolvedValue(existingRecord);

    const result = await getOrCreateCurrentUserRecord();

    expect(result).toEqual(existingRecord);
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockCurrentUser).not.toHaveBeenCalled();
  });

  it('returns null when no authenticated user is present', async () => {
    const result = await getOrCreateCurrentUserRecord();
    expect(result).toBeNull();
    expect(mockGetUserByClerkId).not.toHaveBeenCalled();
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockCurrentUser).not.toHaveBeenCalled();
  });

  it('requireCurrentUserRecord throws if authentication is missing', async () => {
    await expect(requireCurrentUserRecord()).rejects.toBeInstanceOf(AuthError);
  });
});
