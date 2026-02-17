import { describe, expect, it, vi } from 'vitest';

import { cleanupInternalDbClient } from '@/lib/db/queries/helpers/db-client-lifecycle';

describe('cleanupInternalDbClient', () => {
  it('does not cleanup when shouldCleanup is false', async () => {
    const cleanup = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const destroy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await cleanupInternalDbClient({ cleanup, destroy }, false);

    expect(cleanup).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });

  it('calls cleanup when present and shouldCleanup is true', async () => {
    const cleanup = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const destroy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await cleanupInternalDbClient({ cleanup, destroy }, true);

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
  });

  it('calls destroy when cleanup is absent and shouldCleanup is true', async () => {
    const destroy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await cleanupInternalDbClient({ destroy }, true);

    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when client has no cleanup methods', async () => {
    await expect(cleanupInternalDbClient({}, true)).resolves.toBeUndefined();
  });
});
