import { describe, expect, it, vi } from 'vitest';

import { cleanupDbClient } from '@/lib/db/queries/helpers/db-client-lifecycle';

describe('cleanupDbClient', () => {
  it('calls cleanup when present', async () => {
    const cleanup = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const destroy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await cleanupDbClient({ cleanup, destroy });

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
  });

  it('calls destroy when cleanup is absent', async () => {
    const destroy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await cleanupDbClient({ destroy });

    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when client has no cleanup methods', async () => {
    await expect(cleanupDbClient({})).resolves.toBeUndefined();
  });
});
