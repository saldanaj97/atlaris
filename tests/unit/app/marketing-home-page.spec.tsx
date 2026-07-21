import Home from '@/app/(marketing)/page';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSessionSafeMock, redirectMock } = vi.hoisted(() => ({
  getSessionSafeMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  getSessionSafe: getSessionSafeMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('marketing home page', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LOCAL_PRODUCT_TESTING', 'false');
    vi.stubEnv('DEV_AUTH_USER_ID', 'local-dev-user');
    getSessionSafeMock.mockResolvedValue({ session: null });
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('sends an anonymous visitor to the landing page despite a dev auth override', async () => {
    await expect(Home()).rejects.toThrow('redirect:/landing');
  });
});
