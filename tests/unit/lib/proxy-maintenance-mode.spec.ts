import { describe, expect, it, vi } from 'vitest';

import { resolveEffectiveMaintenanceMode } from '@/lib/proxy/maintenance-mode';

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
    const resolveMaintenanceFlag = vi
      .fn()
      .mockRejectedValue(new Error('flags unavailable'));

    await expect(
      resolveEffectiveMaintenanceMode(false, { resolveMaintenanceFlag }),
    ).resolves.toBe(false);
  });
});
