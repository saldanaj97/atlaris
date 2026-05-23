import { vi } from 'vitest';

type AuthSessionData = {
  user?: {
    id: string;
    email?: string | null;
    name?: string;
  } | null;
};

type AuthProviderUser = {
  id: string;
  email: string | null;
  name?: string;
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
    },
  },
};

const defaultAuthUser: AuthProviderUser = {
  id: 'test-auth-user',
  email: 'test@example.com',
  name: 'Test User',
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
