import {
  isDirectResearchEnabled,
  isEmailDeliveryEnabled,
  isJobsPaused,
  isModuleLessonsEnabled,
  isRetentionCleanupEnabled,
} from '../../../../workers/jobs/src/switches';
import { type FlagEvaluator, setFlagEvaluator } from '@/flags';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Serves `values`; a key set to `'error'` reports an evaluation error. */
function useFlags(values: Record<string, boolean | 'error'>): void {
  const evaluator: FlagEvaluator = {
    getBooleanDetails: async (key, defaultValue) => {
      const value = values[key];
      return value === 'error'
        ? { value: defaultValue, errorCode: 'GENERAL' }
        : { value: value ?? defaultValue };
    },
  };
  setFlagEvaluator(evaluator);
}

// The flag source is process-wide, so these tests must not interleave.
describe.sequential('Worker job switches (Flagship)', () => {
  afterEach(() => {
    setFlagEvaluator(null);
    vi.unstubAllEnvs();
  });

  describe('isJobsPaused', () => {
    it.each([
      [false, false],
      [true, true],
    ])('jobs-paused=%s → %s', async (value, expected) => {
      useFlags({ 'jobs-paused': value });
      await expect(isJobsPaused()).resolves.toBe(expected);
    });

    it('fails open: a failed read does not pause jobs', async () => {
      useFlags({ 'jobs-paused': 'error' });
      await expect(isJobsPaused()).resolves.toBe(false);
    });
  });

  describe('isRetentionCleanupEnabled', () => {
    it('follows job-retention-cleanup', async () => {
      useFlags({ 'job-retention-cleanup': true });
      await expect(isRetentionCleanupEnabled()).resolves.toBe(true);
      useFlags({ 'job-retention-cleanup': false });
      await expect(isRetentionCleanupEnabled()).resolves.toBe(false);
    });

    it('is off while jobs are paused', async () => {
      useFlags({ 'jobs-paused': true, 'job-retention-cleanup': true });
      await expect(isRetentionCleanupEnabled()).resolves.toBe(false);
    });

    it('fails closed: a failed read skips the cleanup', async () => {
      useFlags({ 'job-retention-cleanup': 'error' });
      await expect(isRetentionCleanupEnabled()).resolves.toBe(false);
    });
  });

  describe.each([
    [
      'isEmailDeliveryEnabled',
      isEmailDeliveryEnabled,
      'email-notification-delivery',
    ],
    [
      'isModuleLessonsEnabled',
      isModuleLessonsEnabled,
      'module-lesson-generation',
    ],
  ] as const)('%s', (_name, isEnabled, flag) => {
    it(`follows ${flag}`, async () => {
      useFlags({ [flag]: true });
      await expect(isEnabled()).resolves.toBe(true);
      useFlags({ [flag]: false });
      await expect(isEnabled()).resolves.toBe(false);
    });

    it('is off while jobs are paused', async () => {
      useFlags({ 'jobs-paused': true, [flag]: true });
      await expect(isEnabled()).resolves.toBe(false);
    });

    it('fails closed on a failed read', async () => {
      useFlags({ [flag]: 'error' });
      await expect(isEnabled()).resolves.toBe(false);
    });
  });

  describe('isDirectResearchEnabled (DEV-171)', () => {
    beforeEach(() => {
      vi.stubEnv('PARALLEL_API_KEY', 'parallel-key');
    });

    it.each([
      [false, false],
      [true, true],
    ])('parallel-direct-research=%s → %s', async (value, expected) => {
      useFlags({ 'parallel-direct-research': value });
      await expect(isDirectResearchEnabled()).resolves.toBe(expected);
    });

    it('stays off without PARALLEL_API_KEY, so research keeps working', async () => {
      vi.stubEnv('PARALLEL_API_KEY', '');
      useFlags({ 'parallel-direct-research': true });
      await expect(isDirectResearchEnabled()).resolves.toBe(false);
    });

    it('fails closed on a failed read', async () => {
      useFlags({ 'parallel-direct-research': 'error' });
      await expect(isDirectResearchEnabled()).resolves.toBe(false);
    });
  });
});
