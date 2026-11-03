import { isRegenerationPaused } from '@/features/plans/regeneration-orchestration/paused-flag';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  regenerationPaused: vi.fn(),
  scope: { setTag: vi.fn(), setExtra: vi.fn() },
  captureException: vi.fn(),
}));

vi.mock('@/flags', () => ({ regenerationPaused: mocks.regenerationPaused }));
vi.mock('@/lib/logging/logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('@sentry/nextjs', () => ({
  withScope: (callback: (scope: typeof mocks.scope) => void) => {
    callback(mocks.scope);
  },
  captureException: mocks.captureException,
}));

describe('isRegenerationPaused', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([true, false])('returns the flag value %s', async (value) => {
    mocks.regenerationPaused.mockResolvedValue(value);

    await expect(isRegenerationPaused()).resolves.toBe(value);
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it('fails open and reports to Sentry when evaluation throws', async () => {
    const flagErr = new Error('flags unavailable');
    mocks.regenerationPaused.mockRejectedValue(flagErr);

    await expect(isRegenerationPaused()).resolves.toBe(false);
    expect(mocks.captureException).toHaveBeenCalledWith(flagErr);
    expect(mocks.scope.setTag).toHaveBeenCalledWith(
      'feature',
      'regeneration_paused_flag',
    );
    expect(mocks.scope.setTag).toHaveBeenCalledWith('outcome', 'fail_open');
  });
});
