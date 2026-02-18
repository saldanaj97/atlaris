import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logging/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { cleanupDbClient } from '@/lib/db/queries/helpers/db-client-lifecycle';
import { logger } from '@/lib/logging/logger';

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

  it('falls back to destroy when cleanup throws', async () => {
    const cleanup = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error('cleanup boom'));
    const destroy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await cleanupDbClient({ cleanup, destroy });

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('cleanup() failed')
    );
  });

  it('throws TypeError when client has no cleanup or destroy methods', async () => {
    await expect(cleanupDbClient({})).rejects.toThrow(TypeError);
  });

  it.each([null, undefined, 42, 'string', true])(
    'throws TypeError for non-object input: %s',
    async (value) => {
      await expect(cleanupDbClient(value)).rejects.toThrow(TypeError);
    }
  );
});
