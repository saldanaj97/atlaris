import type { DbClient } from '@/lib/db/types';

import {
  runPostHogDeletion,
  type PostHogDeletionDeps,
} from '../../../../workers/jobs/src/jobs/posthog-deletion';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const retry = vi.hoisted(() => ({ run: vi.fn() }));

vi.mock('@/features/auth/posthog-person-deletion', () => ({
  retryPostHogPersonDeletions: retry.run,
}));

const fakeDb = { tag: 'worker-db' } as unknown as DbClient;
const now = new Date('2026-10-17T03:00:00.000Z');

function makeDeps(overrides: Partial<PostHogDeletionDeps> = {}) {
  const logger = { error: vi.fn(), info: vi.fn() };
  const captureException = vi.fn();
  const withDb = vi.fn((fn: (db: DbClient) => Promise<unknown>) => fn(fakeDb));
  const deps = {
    enabled: true,
    apiKey: 'phx_test',
    logger,
    withDb,
    captureException,
    now: () => now,
    ...overrides,
  } as unknown as PostHogDeletionDeps;
  return { deps, logger, captureException, withDb };
}

describe('runPostHogDeletion', () => {
  beforeEach(() => {
    retry.run.mockReset();
  });

  it('retries pending deletions with the Worker db client', async () => {
    retry.run.mockResolvedValue({ deleted: 2 });
    const { deps, logger } = makeDeps();

    await expect(runPostHogDeletion(deps)).resolves.toEqual({ deleted: 2 });

    expect(retry.run).toHaveBeenCalledWith({
      apiKey: 'phx_test',
      db: fakeDb,
      logger,
      now,
    });
  });

  it('skips without db access when the switch is off', async () => {
    const { deps, withDb } = makeDeps({ enabled: false });

    await expect(runPostHogDeletion(deps)).resolves.toBe('skipped');
    expect(withDb).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the API key is missing',
      { apiKey: undefined },
      'POSTHOG_PERSONAL_API_KEY is not set',
    ],
    ['PostHog rejects the request', {}, 'PostHog person deletion failed'],
  ])(
    'reports with job tags and rethrows when %s',
    async (_label, overrides, message) => {
      retry.run.mockRejectedValue(new Error('PostHog person deletion failed'));
      const { deps, captureException } = makeDeps(overrides);

      await expect(runPostHogDeletion(deps)).rejects.toThrow(message);

      expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
        tags: { job: 'posthog-deletion', runtime: 'cloudflare-worker' },
      });
    },
  );
});
