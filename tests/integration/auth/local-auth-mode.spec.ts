import { clearTestUser, setTestUser } from '@/../tests/helpers/auth';
import { runServerComponentContext } from '@/lib/api/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('local product testing identity', () => {
  beforeEach(() => {
    vi.stubEnv('LOCAL_PRODUCT_TESTING', 'true');
  });

  afterEach(() => {
    clearTestUser();
    vi.unstubAllEnvs();
  });

  it('rejects when no user row exists for DEV_AUTH_USER_ID', async () => {
    setTestUser('ghost-user-not-in-database');
    await expect(runServerComponentContext(async () => 'ok')).rejects.toThrow(
      /Local product testing requires a seeded user row/,
    );
  });
});
