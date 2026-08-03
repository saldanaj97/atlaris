import {
  resolveModuleLessonGenerationEnabled,
  setModuleLessonGenerationEnabledForTests,
} from '@/features/lesson-content/generation-flag';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  moduleLessonGeneration: vi.fn(),
}));

vi.mock('@/flags', () => ({
  moduleLessonGeneration: mocks.moduleLessonGeneration,
}));

describe('resolveModuleLessonGenerationEnabled', () => {
  afterEach(() => {
    setModuleLessonGenerationEnabledForTests(undefined);
    mocks.moduleLessonGeneration.mockReset();
  });

  it('returns true when the Vercel Flag evaluates to true', async () => {
    mocks.moduleLessonGeneration.mockResolvedValue(true);

    await expect(resolveModuleLessonGenerationEnabled()).resolves.toBe(true);
    expect(mocks.moduleLessonGeneration).toHaveBeenCalledOnce();
  });

  it('returns false when the Vercel Flag evaluates to false', async () => {
    mocks.moduleLessonGeneration.mockResolvedValue(false);

    await expect(resolveModuleLessonGenerationEnabled()).resolves.toBe(false);
  });

  it('fails closed when flag evaluation throws', async () => {
    mocks.moduleLessonGeneration.mockRejectedValue(new Error('flags down'));

    await expect(resolveModuleLessonGenerationEnabled()).resolves.toBe(false);
  });

  it('honors the test override without evaluating the flag', async () => {
    setModuleLessonGenerationEnabledForTests(true);

    await expect(resolveModuleLessonGenerationEnabled()).resolves.toBe(true);
    expect(mocks.moduleLessonGeneration).not.toHaveBeenCalled();
  });
});
