import { isGroundedEnabled } from '@/features/ai/grounded-generation-flag';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const groundedGeneration = vi.hoisted(() => vi.fn());

vi.mock('@/flags', () => ({ groundedGeneration }));

describe('isGroundedEnabled', () => {
  beforeEach(() => {
    groundedGeneration.mockReset();
  });

  it('is on only for listed tiers', async () => {
    groundedGeneration.mockResolvedValue(['starter', 'pro']);

    await expect(isGroundedEnabled('free')).resolves.toBe(false);
    await expect(isGroundedEnabled('starter')).resolves.toBe(true);
    await expect(isGroundedEnabled('pro')).resolves.toBe(true);
  });

  it('is off for every tier at the default', async () => {
    groundedGeneration.mockResolvedValue([]);

    for (const tier of ['free', 'starter', 'pro'] as const) {
      await expect(isGroundedEnabled(tier)).resolves.toBe(false);
    }
  });

  it('fails closed when evaluation throws', async () => {
    groundedGeneration.mockRejectedValue(new Error('flags unavailable'));

    await expect(isGroundedEnabled('pro')).resolves.toBe(false);
  });

  it.each([[true], ['pro'], [['pro', 'enterprise']], [null]])(
    'fails closed on a malformed value %j',
    async (value) => {
      groundedGeneration.mockResolvedValue(value);

      await expect(isGroundedEnabled('pro')).resolves.toBe(false);
    },
  );
});
