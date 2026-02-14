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

  it('falls back to DEFAULT_ATTEMPT_CAP when attemptsEnv.cap is NaN', async () => {
    vi.doMock('@/lib/config/env', () => ({
      attemptsEnv: { cap: Number.NaN },
    }));

    const { ATTEMPT_CAP } = await import('@/lib/ai/generation-policy');
    expect(ATTEMPT_CAP).toBe(DEFAULT_ATTEMPT_CAP);
  });

  it('falls back to DEFAULT_ATTEMPT_CAP when attemptsEnv.cap is negative', async () => {
    vi.doMock('@/lib/config/env', () => ({
      attemptsEnv: { cap: -1 },
    }));

    const { ATTEMPT_CAP } = await import('@/lib/ai/generation-policy');
    expect(ATTEMPT_CAP).toBe(DEFAULT_ATTEMPT_CAP);
  });

  it('falls back to DEFAULT_ATTEMPT_CAP when attemptsEnv.cap is zero', async () => {
    vi.doMock('@/lib/config/env', () => ({
      attemptsEnv: { cap: 0 },
    }));

    const { ATTEMPT_CAP } = await import('@/lib/ai/generation-policy');
    expect(ATTEMPT_CAP).toBe(DEFAULT_ATTEMPT_CAP);
  });

  it('uses 1 when attemptsEnv.cap is exactly 1 (boundary)', async () => {
    vi.doMock('@/lib/config/env', () => ({
      attemptsEnv: { cap: 1 },
    }));

    const { ATTEMPT_CAP } = await import('@/lib/ai/generation-policy');
    expect(ATTEMPT_CAP).toBe(1);
  });

  it('uses integer cap when attemptsEnv.cap is already an integer >= 1', async () => {
    vi.doMock('@/lib/config/env', () => ({
      attemptsEnv: { cap: 3 },
    }));

    const { ATTEMPT_CAP } = await import('@/lib/ai/generation-policy');
    expect(ATTEMPT_CAP).toBe(3);
  });
});
