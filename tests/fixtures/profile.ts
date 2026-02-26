/**
 * Test factory for client-side profile objects (as returned by the API).
 */

interface ProfileFixture {
  id: string;
  name: string;
  email: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  createdAt: string;
}

export function buildProfile(
  overrides: Partial<ProfileFixture> = {}
): ProfileFixture {
  return {
    id: 'user-123',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subscriptionTier: 'free',
    subscriptionStatus: 'active',
    createdAt: '2025-06-15T10:00:00.000Z',
    ...overrides,
  };
}
