import { beforeEach, describe, expect, it, vi } from 'vitest';

import { maintenanceMode } from '@/flags';
import { resolveEffectiveMaintenanceMode } from '@/lib/proxy/maintenance-mode';

vi.mock('@/flags', () => ({
  maintenanceMode: vi.fn(),
}));

const mockedMaintenanceMode = vi.mocked(maintenanceMode);

describe('resolveEffectiveMaintenanceMode', () => {
  beforeEach(() => {
    mockedMaintenanceMode.mockReset();
  });

  it('returns true without evaluating the flag when env maintenance mode is enabled', async () => {
    await expect(resolveEffectiveMaintenanceMode(true)).resolves.toBe(true);

    expect(mockedMaintenanceMode).not.toHaveBeenCalled();
  });

  it('returns the flag value when env maintenance mode is disabled', async () => {
    mockedMaintenanceMode.mockResolvedValue(true);

    await expect(resolveEffectiveMaintenanceMode(false)).resolves.toBe(true);

    expect(mockedMaintenanceMode).toHaveBeenCalledOnce();
  });

  it('fails open when flag evaluation fails and env maintenance mode is disabled', async () => {
    mockedMaintenanceMode.mockRejectedValue(new Error('flags unavailable'));

    await expect(resolveEffectiveMaintenanceMode(false)).resolves.toBe(false);
  });
});
