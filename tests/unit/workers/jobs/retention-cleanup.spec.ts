import type { DbClient } from '@/lib/db/types';

import {
  RETENTION_CLEANUP_CRON,
  runRetentionCleanup,
  type RetentionCleanupDeps,
} from '../../../../workers/jobs/src/jobs/retention-cleanup';
import { isJobEnabled } from '../../../../workers/jobs/src/switches';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const retention = vi.hoisted(() => ({ run: vi.fn() }));

vi.mock('@/lib/db/queries/admin/retention', () => ({
  cleanupRetainedDbRows: retention.run,
}));

const fakeDb = { tag: 'worker-db' } as unknown as DbClient;
const now = new Date('2026-10-06T03:00:00.000Z');

function makeDeps(enabled = true) {
  const logger = { info: vi.fn() };
  const captureException = vi.fn();
  const withDb = vi.fn((fn: (db: DbClient) => Promise<unknown>) => fn(fakeDb));
  const deps = {
    enabled,
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

  it('skips without db access when the switch is off', async () => {
    const { deps, withDb } = makeDeps(false);

    await expect(runRetentionCleanup(deps)).resolves.toBe('skipped');

    expect(withDb).not.toHaveBeenCalled();
    expect(retention.run).not.toHaveBeenCalled();
  });

  it('skips when jobs are paused even if the switch is on', async () => {
    const enabled = isJobEnabled(
      { JOBS_PAUSED: 'true', JOB_RETENTION_CLEANUP_ENABLED: 'true' },
      'RETENTION_CLEANUP',
    );
    const { deps, withDb } = makeDeps(enabled);

    await expect(runRetentionCleanup(deps)).resolves.toBe('skipped');
    expect(withDb).not.toHaveBeenCalled();
  });

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
