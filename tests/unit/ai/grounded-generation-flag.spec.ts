import { isGroundedEnabled } from '@/features/ai/grounded-generation-flag';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const groundedGeneration = vi.hoisted(() => vi.fn());

vi.mock('@/flags', () => ({ groundedGeneration }));

describe('isGroundedEnabled', () => {
  beforeEach(() => {
    groundedGeneration.mockReset();
  });

  it('is on only for the tiers the flag targets', async () => {
    groundedGeneration.mockImplementation(
      async (tier: string) => tier !== 'free',
    );

    await expect(isGroundedEnabled('free')).resolves.toBe(false);
    await expect(isGroundedEnabled('starter')).resolves.toBe(true);
    await expect(isGroundedEnabled('pro')).resolves.toBe(true);
    expect(groundedGeneration).toHaveBeenLastCalledWith('pro');
  });

  it('is off for every tier at the default', async () => {
    groundedGeneration.mockResolvedValue(false);

    for (const tier of ['free', 'starter', 'pro'] as const) {
      await expect(isGroundedEnabled(tier)).resolves.toBe(false);
    }
  });

  it('fails closed when evaluation throws', async () => {
    groundedGeneration.mockRejectedValue(new Error('flags unavailable'));

    await expect(isGroundedEnabled('pro')).resolves.toBe(false);
  });
});
