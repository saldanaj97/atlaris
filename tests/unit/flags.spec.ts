import type { FlagEvaluator } from '@/flags';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  flagshipEnv: {
    appId: undefined as string | undefined,
    accountId: undefined as string | undefined,
    apiToken: undefined as string | undefined,
    isConfigured: false,
    isRequired: false,
    environment: 'development' as const,
  },
  setProviderAndWait: vi.fn(),
  getClient: vi.fn(),
  FlagshipServerProvider: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@/lib/config/env/flagship', () => ({
  flagshipEnv: mocks.flagshipEnv,
}));
vi.mock('@/lib/logging/logger', () => ({ logger: { warn: mocks.warn } }));

vi.mock('@openfeature/server-sdk', () => ({
  OpenFeature: {
    setProviderAndWait: mocks.setProviderAndWait,
    getClient: mocks.getClient,
  },
}));

vi.mock('@cloudflare/flagship/server', () => ({
  FlagshipServerProvider: mocks.FlagshipServerProvider,
}));

function fakeEvaluator(
  details: (key: string) => { value: boolean; errorCode?: string },
) {
  const getBooleanDetails = vi.fn(async (key: string) => details(key));
  const evaluator: FlagEvaluator = { getBooleanDetails };
  return { evaluator, getBooleanDetails };
}

describe('flags', () => {
  beforeEach(async () => {
    const { setFlagEvaluator } = await import('@/flags');
    setFlagEvaluator(null);
    mocks.flagshipEnv.isConfigured = false;
    mocks.flagshipEnv.isRequired = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('returns the fail-closed default without a provider outside hosted deploys', async () => {
    const { launchWaitlist, groundedGeneration } = await import('@/flags');

    await expect(launchWaitlist()).resolves.toBe(false);
    await expect(groundedGeneration('pro')).resolves.toBe(false);
    expect(mocks.setProviderAndWait).not.toHaveBeenCalled();
  });

  it('throws on a hosted deploy with no provider so the gate fail-safes apply', async () => {
    mocks.flagshipEnv.isRequired = true;
    const { maintenanceMode, FlagEvaluationError } = await import('@/flags');

    await expect(maintenanceMode()).rejects.toBeInstanceOf(FlagEvaluationError);
    await expect(maintenanceMode()).rejects.toMatchObject({
      code: 'PROVIDER_NOT_CONFIGURED',
    });
    // Remembered and logged once like any other failure.
    expect(mocks.warn).toHaveBeenCalledOnce();
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PROVIDER_NOT_CONFIGURED' }),
      expect.any(String),
    );
  });

  it('evaluates through the registered evaluator with the environment and tier', async () => {
    const { groundedGeneration, setFlagEvaluator } = await import('@/flags');
    const { evaluator, getBooleanDetails } = fakeEvaluator(() => ({
      value: true,
    }));
    setFlagEvaluator(evaluator);

    await expect(groundedGeneration('starter')).resolves.toBe(true);
    expect(getBooleanDetails).toHaveBeenCalledWith(
      'grounded-generation',
      false,
      { environment: 'development', subscriptionTier: 'starter' },
    );
  });

  it('throws when Flagship reports an evaluation error', async () => {
    const { moduleLessonGeneration, setFlagEvaluator, FlagEvaluationError } =
      await import('@/flags');
    setFlagEvaluator(
      fakeEvaluator(() => ({ value: false, errorCode: 'FLAG_NOT_FOUND' }))
        .evaluator,
    );

    await expect(moduleLessonGeneration()).rejects.toMatchObject({
      name: 'FlagEvaluationError',
      flagKey: 'module-lesson-generation',
      code: 'FLAG_NOT_FOUND',
    });
    await expect(moduleLessonGeneration()).rejects.toBeInstanceOf(
      FlagEvaluationError,
    );
  });

  it('builds the OpenFeature provider once with response caching when configured', async () => {
    mocks.flagshipEnv.isConfigured = true;
    mocks.flagshipEnv.appId = 'app-1';
    mocks.flagshipEnv.accountId = 'account-1';
    mocks.flagshipEnv.apiToken = 'token-1';
    const client = fakeEvaluator(() => ({ value: true }));
    mocks.getClient.mockReturnValue(client.evaluator);
    const { emailNotificationDelivery, FLAG_CACHE_TTL_MS } =
      await import('@/flags');

    await expect(emailNotificationDelivery()).resolves.toBe(true);
    await expect(emailNotificationDelivery()).resolves.toBe(true);

    expect(mocks.FlagshipServerProvider).toHaveBeenCalledOnce();
    expect(mocks.FlagshipServerProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app-1',
        accountId: 'account-1',
        authToken: 'token-1',
        cacheTtl: FLAG_CACHE_TTL_MS,
      }),
    );
    expect(mocks.setProviderAndWait).toHaveBeenCalledOnce();
    expect(client.getBooleanDetails).toHaveBeenCalledTimes(2);
  });

  it('retries provider setup once the failure window has passed', async () => {
    vi.useFakeTimers();
    mocks.flagshipEnv.isConfigured = true;
    const cause = new Error('init failed');
    mocks.setProviderAndWait.mockRejectedValueOnce(cause);
    mocks.getClient.mockReturnValue(
      fakeEvaluator(() => ({ value: false })).evaluator,
    );
    const { maintenanceMode, FLAG_FAILURE_TTL_MS } = await import('@/flags');

    await expect(maintenanceMode()).rejects.toMatchObject({
      code: 'PROVIDER_SETUP_FAILED',
      cause,
    });
    await expect(maintenanceMode()).rejects.toMatchObject({
      code: 'PROVIDER_SETUP_FAILED',
    });
    expect(mocks.setProviderAndWait).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(FLAG_FAILURE_TTL_MS + 1);
    await expect(maintenanceMode()).resolves.toBe(false);
    expect(mocks.setProviderAndWait).toHaveBeenCalledTimes(2);
  });

  it('serves a remembered failure without a provider call until the window passes', async () => {
    vi.useFakeTimers();
    const {
      groundedGeneration,
      launchWaitlist,
      setFlagEvaluator,
      FLAG_FAILURE_TTL_MS,
    } = await import('@/flags');
    let failing = true;
    const { evaluator, getBooleanDetails } = fakeEvaluator(() =>
      failing ? { value: false, errorCode: 'GENERAL' } : { value: true },
    );
    setFlagEvaluator(evaluator);

    await expect(groundedGeneration('pro')).rejects.toMatchObject({
      code: 'GENERAL',
    });
    await expect(groundedGeneration('pro')).rejects.toMatchObject({
      code: 'GENERAL',
    });
    expect(getBooleanDetails).toHaveBeenCalledOnce();
    expect(mocks.warn).toHaveBeenCalledOnce();
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        flagKey: 'grounded-generation',
        code: 'GENERAL',
        context: { environment: 'development', subscriptionTier: 'pro' },
      }),
      expect.stringContaining('fail-closed'),
    );

    // Another flag, and the same flag with another context, are not affected.
    failing = false;
    await expect(launchWaitlist()).resolves.toBe(true);
    await expect(groundedGeneration('starter')).resolves.toBe(true);
    expect(getBooleanDetails).toHaveBeenCalledTimes(3);
    await expect(groundedGeneration('pro')).rejects.toMatchObject({
      code: 'GENERAL',
    });
    expect(getBooleanDetails).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(FLAG_FAILURE_TTL_MS + 1);
    await expect(groundedGeneration('pro')).resolves.toBe(true);
    expect(getBooleanDetails).toHaveBeenCalledTimes(4);
  });

  it('wraps a throwing evaluator and remembers that failure too', async () => {
    const { moduleLessonGeneration, setFlagEvaluator } =
      await import('@/flags');
    const cause = new Error('socket hang up');
    const getBooleanDetails = vi.fn(async () => {
      throw cause;
    });
    setFlagEvaluator({ getBooleanDetails });

    await expect(moduleLessonGeneration()).rejects.toMatchObject({
      name: 'FlagEvaluationError',
      code: 'EVALUATION_FAILED',
      cause,
    });
    await expect(moduleLessonGeneration()).rejects.toMatchObject({
      code: 'EVALUATION_FAILED',
    });
    expect(getBooleanDetails).toHaveBeenCalledOnce();
  });
});
