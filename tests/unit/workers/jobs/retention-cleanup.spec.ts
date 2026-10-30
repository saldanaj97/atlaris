import type { RetentionCleanupGate } from '../../../../workers/jobs/src/switches';
import type { DbClient } from '@/lib/db/types';

import {
  RETENTION_CLEANUP_CRON,
  runRetentionCleanup,
  type RetentionCleanupDeps,
} from '../../../../workers/jobs/src/jobs/retention-cleanup';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const retention = vi.hoisted(() => ({ run: vi.fn() }));

vi.mock('@/lib/db/queries/admin/retention', () => ({
  cleanupRetainedDbRows: retention.run,
}));

const fakeDb = { tag: 'worker-db' } as unknown as DbClient;
const now = new Date('2026-10-06T03:00:00.000Z');

function makeDeps(gate: RetentionCleanupGate = 'run') {
  const logger = { info: vi.fn(), warn: vi.fn() };
  const captureException = vi.fn();
  const withDb = vi.fn((fn: (db: DbClient) => Promise<unknown>) => fn(fakeDb));
  const deps = {
    gate,
    logger,
    withDb,
    captureException,
    now: () => now,
  } as unknown as RetentionCleanupDeps;
  return { deps, logger, captureException, withDb };
}

describe('runRetentionCleanup', () => {
  beforeEach(() => {
    retention.run.mockReset();
  });

  it('runs cleanup with the Worker db client', async () => {
    const summary = {
      expiredOauthStateTokens: 1,
      expiredClerkWebhookEventClaims: 0,
      oldClerkWebhookEvents: 2,
      oldJobQueueRows: 3,
    };
    retention.run.mockResolvedValue(summary);
    const { deps, logger } = makeDeps();

    await expect(runRetentionCleanup(deps)).resolves.toEqual(summary);

    expect(RETENTION_CLEANUP_CRON).toBe('0 3 * * *');
    expect(retention.run).toHaveBeenCalledWith({ now, dbClient: fakeDb });
    expect(logger.info).toHaveBeenCalledWith(
      { job: 'retention-cleanup', ...summary },
      'Completed retention cleanup',
    );
  });

  it.each([
    ['paused', 'info', 'Jobs paused; retention cleanup skipped'],
    ['disabled', 'info', 'Retention cleanup disabled; skipped'],
    [
      'flag_unavailable',
      'warn',
      'Retention cleanup skipped: a flag could not be read',
    ],
  ] as const)(
    'skips without db access when the gate is %s, with its own log',
    async (gate, level, message) => {
      const { deps, logger, withDb } = makeDeps(gate);

      await expect(runRetentionCleanup(deps)).resolves.toBe('skipped');

      expect(withDb).not.toHaveBeenCalled();
      expect(retention.run).not.toHaveBeenCalled();
      expect(logger[level]).toHaveBeenCalledWith(
        { job: 'retention-cleanup' },
        message,
      );
    },
  );

  it('reports a skip on an unreadable flag to Sentry', async () => {
    const { deps, captureException } = makeDeps('flag_unavailable');

    await runRetentionCleanup(deps);

    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Retention cleanup skipped: a flag could not be read',
      }),
      { tags: { job: 'retention-cleanup', runtime: 'cloudflare-worker' } },
    );
  });

  it.each(['paused', 'disabled'] as const)(
    'does not report a deliberate %s skip to Sentry',
    async (gate) => {
      const { deps, captureException } = makeDeps(gate);

      await runRetentionCleanup(deps);

      expect(captureException).not.toHaveBeenCalled();
    },
  );

  it('reports with job tags and rethrows on failure', async () => {
    const error = new Error('boom');
    retention.run.mockRejectedValue(error);
    const { deps, captureException } = makeDeps();

    await expect(runRetentionCleanup(deps)).rejects.toBe(error);

    expect(captureException).toHaveBeenCalledWith(error, {
      tags: { job: 'retention-cleanup', runtime: 'cloudflare-worker' },
    });
  });
});
