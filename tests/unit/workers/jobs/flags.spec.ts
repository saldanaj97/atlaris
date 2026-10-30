import type { FlagEnv } from '../../../../workers/jobs/src/env';

import {
  createWorkerFlagEvaluator,
  registerWorkerFlags,
} from '../../../../workers/jobs/src/flags';
import { isGroundedEnabled } from '@/features/ai/grounded-generation-flag';
import { setFlagEvaluator } from '@/flags';
import { afterEach, describe, expect, it, vi } from 'vitest';

function makeFlagEnv(
  details: { value: boolean; errorCode?: string } = { value: false },
): FlagEnv & { getBooleanDetails: ReturnType<typeof vi.fn> } {
  const getBooleanDetails = vi.fn(async () => details);
  return {
    FLAGS: { getBooleanDetails } as unknown as Flagship,
    WORKER_ENV: 'staging',
    getBooleanDetails,
  };
}

describe('Worker flags', () => {
  afterEach(() => {
    setFlagEvaluator(null);
  });

  it('evaluates through the binding with the environment pinned to WORKER_ENV', async () => {
    const env = makeFlagEnv({ value: true });

    await expect(
      createWorkerFlagEvaluator(env).getBooleanDetails('x', false, {
        environment: 'development',
        subscriptionTier: 'pro',
      }),
    ).resolves.toEqual({ value: true });
    expect(env.getBooleanDetails).toHaveBeenCalledWith('x', false, {
      subscriptionTier: 'pro',
      environment: 'staging',
    });
  });

  it('lets the shared flag helpers read the binding once registered', async () => {
    const env = makeFlagEnv({ value: true });
    registerWorkerFlags(env);

    await expect(isGroundedEnabled('starter')).resolves.toBe(true);
    expect(env.getBooleanDetails).toHaveBeenCalledWith(
      'grounded-generation',
      false,
      { environment: 'staging', subscriptionTier: 'starter' },
    );
  });

  it('fails closed when the binding reports an error', async () => {
    registerWorkerFlags(makeFlagEnv({ value: true, errorCode: 'GENERAL' }));

    await expect(isGroundedEnabled('pro')).resolves.toBe(false);
  });
});
