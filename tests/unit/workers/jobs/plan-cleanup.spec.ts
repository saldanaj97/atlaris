import type { DbClient } from '@/lib/db/types';

import {
  PLAN_CLEANUP_CRON,
  runPlanCleanup,
  type PlanCleanupDeps,
} from '../../../../workers/jobs/src/jobs/plan-cleanup';
import { isJobEnabled } from '../../../../workers/jobs/src/switches';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cleanup = vi.hoisted(() => ({ run: vi.fn() }));

vi.mock('@/features/plans/cleanup', () => ({
  runPlanCleanupMaintenance: cleanup.run,
}));

const fakeDb = { tag: 'worker-db' } as unknown as DbClient;

function makeDeps(enabled = true) {
  const logger = { info: vi.fn() };
  const captureException = vi.fn();
  const withDb = vi.fn((fn: (db: DbClient) => Promise<unknown>) => fn(fakeDb));
  const deps = {
    enabled,
    logger,
    withDb,
    captureException,
  } as unknown as PlanCleanupDeps;
  return { deps, logger, captureException, withDb };
}

describe('runPlanCleanup', () => {
  beforeEach(() => {
    cleanup.run.mockReset();
  });

  it('runs the domain cleanup inside the invocation db scope', async () => {
    const summary = { stuckPlansCleaned: 2, orphanedAttemptsCleaned: 1 };
    cleanup.run.mockResolvedValue(summary);
    const { deps, logger, withDb } = makeDeps();

    await expect(runPlanCleanup(deps)).resolves.toEqual(summary);

    expect(PLAN_CLEANUP_CRON).toBe('*/15 * * * *');
    expect(withDb).toHaveBeenCalledTimes(1);
    expect(cleanup.run).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      { job: 'plan-cleanup', ...summary },
      'Completed plan cleanup',
    );
  });

  it('skips without db access when the switch is off', async () => {
    const { deps, withDb, logger } = makeDeps(false);

    await expect(runPlanCleanup(deps)).resolves.toBe('skipped');

    expect(withDb).not.toHaveBeenCalled();
    expect(cleanup.run).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it('skips when jobs are paused even if the switch is on', async () => {
    const enabled = isJobEnabled(
      { JOBS_PAUSED: 'true', JOB_PLAN_CLEANUP_ENABLED: 'true' },
      'PLAN_CLEANUP',
    );
    const { deps, withDb } = makeDeps(enabled);

    await expect(runPlanCleanup(deps)).resolves.toBe('skipped');
    expect(withDb).not.toHaveBeenCalled();
  });

  it('reports with job tags and rethrows on failure', async () => {
    const error = new Error('boom');
    cleanup.run.mockRejectedValue(error);
    const { deps, captureException } = makeDeps();

    await expect(runPlanCleanup(deps)).rejects.toBe(error);

    expect(captureException).toHaveBeenCalledWith(error, {
      tags: { job: 'plan-cleanup', runtime: 'cloudflare-worker' },
    });
  });
});
