import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_ATTEMPT_CAP } from '@/lib/ai/constants';

describe('generation policy ATTEMPT_CAP', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@/lib/config/env');
  });

  it('falls back to DEFAULT_ATTEMPT_CAP when attemptsEnv.cap is fractional under 1', async () => {
    vi.doMock('@/lib/config/env', () => ({
      attemptsEnv: { cap: 0.5 },
    }));

    const { ATTEMPT_CAP } = await import('@/lib/ai/generation-policy');
    expect(ATTEMPT_CAP).toBe(DEFAULT_ATTEMPT_CAP);
  });

  it('uses floored integer when attemptsEnv.cap is finite and >= 1 after floor', async () => {
    vi.doMock('@/lib/config/env', () => ({
      attemptsEnv: { cap: 2.9 },
    }));

    const { ATTEMPT_CAP } = await import('@/lib/ai/generation-policy');
    expect(ATTEMPT_CAP).toBe(2);
  });
});
