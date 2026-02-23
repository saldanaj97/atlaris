import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('logs warning and no-ops when client has no cleanup or destroy methods', async () => {
    await expect(cleanupDbClient({})).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        clientType: 'object',
        clientConstructor: 'Object',
      }),
      expect.stringContaining('skipping cleanup')
    );
  });

  it.each<
    [value: unknown, expectedClientType: string, expectedConstructor: string]
  >([
    [null, 'object', 'unknown'],
    [undefined, 'undefined', 'unknown'],
    [42, 'number', 'Number'],
    ['string', 'string', 'String'],
    [true, 'boolean', 'Boolean'],
  ])(
    'logs warning and no-ops for non-cleanup input: %s',
    async (value, expectedClientType, expectedConstructor) => {
      const warnMock = vi.mocked(logger.warn);
      warnMock.mockClear();

      await expect(cleanupDbClient(value)).resolves.toBeUndefined();

      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(warnMock).toHaveBeenCalledWith(
        expect.objectContaining({
          clientType: expectedClientType,
          clientConstructor: expectedConstructor,
        }),
        expect.stringContaining('skipping cleanup')
      );
    }
  );
});
