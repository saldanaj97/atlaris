import {
  resetSiteGateCacheForTests,
  resolveSiteGate,
  SITE_GATE_CACHE_TTL_MS,
  SITE_GATE_FALLBACK_CACHE_TTL_MS,
} from '@/lib/proxy/site-gate';
import { createDeferredPromise } from '@tests/helpers/deferred-promise';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  maintenanceMode: vi.fn(),
  launchWaitlist: vi.fn(),
  appEnv: { maintenanceMode: false, launchWaitlist: false },
  scope: { setTag: vi.fn(), setExtra: vi.fn() },
  captureException: vi.fn(),
}));

vi.mock('@/flags', () => ({
  maintenanceMode: mocks.maintenanceMode,
  launchWaitlist: mocks.launchWaitlist,
}));

vi.mock('@/lib/config/env', () => ({ appEnv: mocks.appEnv }));

vi.mock('@sentry/nextjs', () => ({
  withScope: (callback: (scope: typeof mocks.scope) => void) => {
    callback(mocks.scope);
  },
  captureException: mocks.captureException,
}));

const cached = { bypassCache: false };

const gateFlags = [
  {
    gate: 'maintenance',
    flag: mocks.maintenanceMode,
    envKey: 'maintenanceMode',
    feature: 'maintenance_flag',
  },
  {
    gate: 'waitlist',
    flag: mocks.launchWaitlist,
    envKey: 'launchWaitlist',
    feature: 'launch_waitlist_flag',
  },
] as const;

describe('resolveSiteGate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetSiteGateCacheForTests();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.appEnv.maintenanceMode = false;
    mocks.appEnv.launchWaitlist = false;
    mocks.maintenanceMode.mockResolvedValue(false);
    mocks.launchWaitlist.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns null when neither flag is on', async () => {
    await expect(resolveSiteGate(cached)).resolves.toBe(null);
  });

  it('returns waitlist when only the launch waitlist flag is on', async () => {
    mocks.launchWaitlist.mockResolvedValue(true);

    await expect(resolveSiteGate(cached)).resolves.toBe('waitlist');
  });

  it('lets maintenance win when both flags are on', async () => {
    mocks.maintenanceMode.mockResolvedValue(true);
    mocks.launchWaitlist.mockResolvedValue(true);

    await expect(resolveSiteGate(cached)).resolves.toBe('maintenance');
  });

  it.each(gateFlags)(
    'ignores the $envKey fail-safe while the $gate flag evaluates',
    async ({ envKey }) => {
      mocks.appEnv[envKey] = true;

      await expect(resolveSiteGate(cached)).resolves.toBe(null);
      expect(mocks.captureException).not.toHaveBeenCalled();
    },
  );

  it.each(gateFlags)(
    'fails closed to the $envKey fail-safe when the $gate flag throws',
    async ({ gate, flag, envKey, feature }) => {
      const flagErr = new Error('flags unavailable');
      flag.mockRejectedValue(flagErr);
      mocks.appEnv[envKey] = true;

      await expect(resolveSiteGate(cached)).resolves.toBe(gate);

      expect(mocks.scope.setTag).toHaveBeenCalledWith('feature', feature);
      expect(mocks.scope.setTag).toHaveBeenCalledWith('outcome', 'fail_closed');
      expect(mocks.captureException).toHaveBeenCalledWith(flagErr);
    },
  );

  it.each(gateFlags)(
    'fails open when the $gate flag throws and its fail-safe is off',
    async ({ flag, feature }) => {
      const flagErr = new Error('flags unavailable');
      flag.mockRejectedValue(flagErr);

      await expect(resolveSiteGate(cached)).resolves.toBe(null);

      expect(mocks.scope.setTag).toHaveBeenCalledWith('feature', feature);
      expect(mocks.scope.setTag).toHaveBeenCalledWith('outcome', 'fail_open');
      expect(mocks.captureException).toHaveBeenCalledWith(flagErr);
    },
  );

  it('serves a clean result from the cache within the TTL', async () => {
    await expect(resolveSiteGate(cached)).resolves.toBe(null);
    mocks.launchWaitlist.mockResolvedValue(true);

    await expect(resolveSiteGate(cached)).resolves.toBe(null);

    expect(mocks.maintenanceMode).toHaveBeenCalledOnce();
    expect(mocks.launchWaitlist).toHaveBeenCalledOnce();
  });

  it('re-reads the flags once the cached result expires', async () => {
    vi.useFakeTimers();
    await expect(resolveSiteGate(cached)).resolves.toBe(null);
    mocks.launchWaitlist.mockResolvedValue(true);

    vi.advanceTimersByTime(SITE_GATE_CACHE_TTL_MS - 1);
    await expect(resolveSiteGate(cached)).resolves.toBe(null);
    vi.advanceTimersByTime(1);
    await expect(resolveSiteGate(cached)).resolves.toBe('waitlist');

    expect(mocks.launchWaitlist).toHaveBeenCalledTimes(2);
  });

  it.each(gateFlags)(
    'caches a $gate fail-safe result only for the fallback TTL',
    async ({ gate, flag, envKey }) => {
      vi.useFakeTimers();
      flag.mockRejectedValueOnce(new Error('flags unavailable'));
      mocks.appEnv[envKey] = true;
      await expect(resolveSiteGate(cached)).resolves.toBe(gate);

      vi.advanceTimersByTime(SITE_GATE_FALLBACK_CACHE_TTL_MS - 1);
      await expect(resolveSiteGate(cached)).resolves.toBe(gate);
      expect(mocks.captureException).toHaveBeenCalledOnce();

      vi.advanceTimersByTime(1);
      await expect(resolveSiteGate(cached)).resolves.toBe(null);
      expect(mocks.maintenanceMode).toHaveBeenCalledTimes(2);
      expect(mocks.launchWaitlist).toHaveBeenCalledTimes(2);
    },
  );

  it('caches clean maintenance for the full TTL when the waitlist falls back', async () => {
    vi.useFakeTimers();
    mocks.maintenanceMode.mockResolvedValue(true);
    mocks.launchWaitlist.mockRejectedValue(new Error('flags unavailable'));
    await expect(resolveSiteGate(cached)).resolves.toBe('maintenance');

    vi.advanceTimersByTime(SITE_GATE_FALLBACK_CACHE_TTL_MS);
    await expect(resolveSiteGate(cached)).resolves.toBe('maintenance');

    expect(mocks.launchWaitlist).toHaveBeenCalledOnce();
  });

  it('shares one evaluation across concurrent cache misses', async () => {
    const waitlist = createDeferredPromise<boolean>();
    mocks.launchWaitlist.mockReturnValueOnce(waitlist.promise);

    const first = resolveSiteGate(cached);
    const second = resolveSiteGate(cached);
    waitlist.resolve(true);

    await expect(Promise.all([first, second])).resolves.toEqual([
      'waitlist',
      'waitlist',
    ]);
    expect(mocks.maintenanceMode).toHaveBeenCalledOnce();
    expect(mocks.launchWaitlist).toHaveBeenCalledOnce();
  });

  it('neither reads nor writes the cache when bypassCache is set', async () => {
    await expect(resolveSiteGate(cached)).resolves.toBe(null);
    mocks.launchWaitlist.mockResolvedValue(true);

    await expect(resolveSiteGate({ bypassCache: true })).resolves.toBe(
      'waitlist',
    );
    await expect(resolveSiteGate(cached)).resolves.toBe(null);

    expect(mocks.launchWaitlist).toHaveBeenCalledTimes(2);
  });
});
