import { resolveEffectiveMaintenanceMode } from '@/lib/proxy/maintenance-mode';
import * as Sentry from '@sentry/nextjs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  withScope: vi.fn(
    (
      callback: (scope: {
        setTag: ReturnType<typeof vi.fn>;
        setExtra: ReturnType<typeof vi.fn>;
      }) => void,
    ) => {
      callback({
        setTag: vi.fn(),
        setExtra: vi.fn(),
      });
    },
  ),
  captureException: vi.fn(),
}));

describe('resolveEffectiveMaintenanceMode', () => {
  it('returns true without evaluating the flag when env maintenance mode is enabled', async () => {
    const resolveMaintenanceFlag = vi.fn();

    await expect(
      resolveEffectiveMaintenanceMode(true, { resolveMaintenanceFlag }),
    ).resolves.toBe(true);

    expect(resolveMaintenanceFlag).not.toHaveBeenCalled();
  });

  it('returns the flag value when env maintenance mode is disabled', async () => {
    const resolveMaintenanceFlag = vi.fn().mockResolvedValue(true);

    await expect(
      resolveEffectiveMaintenanceMode(false, { resolveMaintenanceFlag }),
    ).resolves.toBe(true);

    expect(resolveMaintenanceFlag).toHaveBeenCalledOnce();
  });

  it('fails open when flag evaluation fails and env maintenance mode is disabled', async () => {
    const flagErr = new Error('flags unavailable');
    const resolveMaintenanceFlag = vi.fn().mockRejectedValue(flagErr);

    await expect(
      resolveEffectiveMaintenanceMode(false, { resolveMaintenanceFlag }),
    ).resolves.toBe(false);

    expect(Sentry.captureException).toHaveBeenCalledOnce();
    expect(Sentry.captureException).toHaveBeenCalledWith(flagErr);
    expect(Sentry.withScope).toHaveBeenCalledOnce();
  });
});
