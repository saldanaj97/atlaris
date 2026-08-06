import { provisionUserFromVerifiedAuthSession } from '@/features/auth/user-provisioning';
import { getOrCreateUser } from '@/lib/db/queries/users';
import { db as serviceDb } from '@supabase/service-role';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/queries/users', () => ({
  getOrCreateUser: vi.fn(),
}));

const mockGetOrCreateUser = vi.mocked(getOrCreateUser);

describe('provisionUserFromVerifiedAuthSession', () => {
  beforeEach(() => {
    mockGetOrCreateUser.mockReset();
  });

  it('uses the service role after the auth boundary has verified Clerk data', async () => {
    const userData = {
      authUserId: 'auth_created',
      email: 'created@example.com',
      name: 'Created User',
      clerkUserUpdatedAt: new Date('2026-08-05T00:00:00.000Z'),
    };
    mockGetOrCreateUser.mockResolvedValue(undefined);

    await provisionUserFromVerifiedAuthSession(userData);

    expect(mockGetOrCreateUser).toHaveBeenCalledWith(userData, serviceDb);
  });
});
