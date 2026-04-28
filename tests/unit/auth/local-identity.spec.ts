import { afterEach, describe, expect, it, vi } from 'vitest';
import { getShellAuthUserId } from '@/lib/auth/local-identity';

describe('getShellAuthUserId', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns session user id when local product testing is off', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LOCAL_PRODUCT_TESTING', 'false');
    vi.stubEnv('DEV_AUTH_USER_ID', 'seed-id');
    expect(getShellAuthUserId('session-id')).toBe('session-id');
  });

  it('returns DEV_AUTH_USER_ID when local product testing is on in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LOCAL_PRODUCT_TESTING', 'true');
    vi.stubEnv('DEV_AUTH_USER_ID', 'seed-id');
    expect(getShellAuthUserId(undefined)).toBe('seed-id');
  });
});
