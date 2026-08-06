import { vi } from 'vitest';

type AuthSessionData = {
  user?: {
    id: string;
    email?: string | null;
    name?: string;
    clerkUserUpdatedAt?: Date;
  } | null;
};

type AuthProviderUser = {
  id: string;
  email: string | null;
  name?: string;
  clerkUserUpdatedAt: Date;
};

type GetSessionResult = { data: AuthSessionData | null };

type MockAuth = {
  getSession: () => Promise<GetSessionResult>;
};

const defaultSession: GetSessionResult = {
  data: {
    user: {
      id: 'test-auth-user',
      email: 'test@example.com',
      name: 'Test User',
      clerkUserUpdatedAt: new Date('2026-08-05T00:00:00.000Z'),
    },
  },
};

const defaultAuthUser: AuthProviderUser = {
  id: 'test-auth-user',
  email: 'test@example.com',
  name: 'Test User',
  clerkUserUpdatedAt: new Date('2026-08-05T00:00:00.000Z'),
};

export const auth: MockAuth = {
  getSession: vi.fn(async (): Promise<GetSessionResult> => defaultSession),
};

export const getSessionSafe = vi.fn(
  async (): Promise<{ session: AuthSessionData | null }> => ({
    session: defaultSession.data,
  }),
);

export const getCurrentAuthUserSafe = vi.fn(
  async (): Promise<AuthProviderUser | null> => defaultAuthUser,
);
