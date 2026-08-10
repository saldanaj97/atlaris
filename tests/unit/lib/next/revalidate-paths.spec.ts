import { afterEach, describe, expect, it, vi } from 'vitest';

const { revalidatePathMock, loggerWarnMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock('@/lib/logging/logger', () => ({
  logger: {
    warn: loggerWarnMock,
  },
}));

import { revalidatePathsBestEffort } from '@/lib/next/revalidate-paths';

describe('revalidatePathsBestEffort', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('revalidates every path and continues when one path throws', () => {
    revalidatePathMock.mockImplementation((path: string) => {
      if (path === '/plans/bad') {
        throw new Error('revalidate failed');
      }
    });

    const result = revalidatePathsBestEffort([
      '/plans/ok',
      '/plans/bad',
      '/plans',
    ]);

    expect(revalidatePathMock).toHaveBeenCalledTimes(3);
    expect(result.failedPaths).toEqual(['/plans/bad']);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/plans/bad',
        revalidatePartialFailure: true,
      }),
      'Failed to revalidate path after mutation',
    );
  });
});
