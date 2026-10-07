import { resolveSiteGate } from '@/lib/proxy/site-gate';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  maintenanceMode: vi.fn(),
  launchWaitlist: vi.fn(),
}));

vi.mock('@/flags', () => ({
  maintenanceMode: mocks.maintenanceMode,
  launchWaitlist: mocks.launchWaitlist,
}));

describe('resolveSiteGate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.maintenanceMode.mockResolvedValue(false);
    mocks.launchWaitlist.mockResolvedValue(false);
  });

  it('returns null when neither flag is on', async () => {
    await expect(resolveSiteGate()).resolves.toBe(null);
  });

  it('returns waitlist when only the launch waitlist flag is on', async () => {
    mocks.launchWaitlist.mockResolvedValue(true);

    await expect(resolveSiteGate()).resolves.toBe('waitlist');
  });

  it('lets maintenance win when both flags are on', async () => {
    mocks.maintenanceMode.mockResolvedValue(true);
    mocks.launchWaitlist.mockResolvedValue(true);

    await expect(resolveSiteGate()).resolves.toBe('maintenance');
  });

  it('fails open when the launch waitlist flag cannot be evaluated', async () => {
    mocks.launchWaitlist.mockRejectedValue(new Error('flags unavailable'));

    await expect(resolveSiteGate()).resolves.toBe(null);
  });
});
