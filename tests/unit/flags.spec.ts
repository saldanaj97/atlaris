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
}));

vi.mock('@/lib/config/env/flagship', () => ({
  flagshipEnv: mocks.flagshipEnv,
}));

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

  it('retries provider setup on the next call after it fails', async () => {
    mocks.flagshipEnv.isConfigured = true;
    mocks.setProviderAndWait.mockRejectedValueOnce(new Error('init failed'));
    mocks.getClient.mockReturnValue(
      fakeEvaluator(() => ({ value: false })).evaluator,
    );
    const { maintenanceMode } = await import('@/flags');

    await expect(maintenanceMode()).rejects.toThrow('init failed');
    await expect(maintenanceMode()).resolves.toBe(false);
    expect(mocks.setProviderAndWait).toHaveBeenCalledTimes(2);
  });
});
