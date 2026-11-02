import type { WorkerEnv } from '../../../../workers/jobs/src/env';
import type {
  JobsPausedState,
  RetentionCleanupGate,
} from '../../../../workers/jobs/src/switches';

import { HEARTBEAT_CRON } from '../../../../workers/jobs/src/jobs/heartbeat';
import { RETENTION_CLEANUP_CRON } from '../../../../workers/jobs/src/jobs/retention-cleanup';
import {
  runScheduledJobs,
  type ScheduledDeps,
} from '../../../../workers/jobs/src/scheduled';
import { describe, expect, it, vi } from 'vitest';

function makeDeps({
  paused = 'running',
  gate = 'run',
  workerEnv = 'production',
}: {
  paused?: JobsPausedState;
  gate?: RetentionCleanupGate;
  workerEnv?: WorkerEnv['WORKER_ENV'];
} = {}) {
  const jobs = {
    heartbeat: vi.fn(async (_paused: boolean) => undefined),
    planCleanup: vi.fn(async (_enabled: boolean) => undefined),
    regenerationSweep: vi.fn(async (_paused: boolean) => undefined),
    retentionCleanup: vi.fn(async (_gate: RetentionCleanupGate) => undefined),
    postHogDeletion: vi.fn(async (_enabled: boolean) => undefined),
  };
  const readJobsPaused = vi.fn(async () => paused);
  const retentionCleanupGate = vi.fn(async (_paused: JobsPausedState) => gate);
  const deps: ScheduledDeps = {
    workerEnv,
    readJobsPaused,
    retentionCleanupGate,
    jobs,
    logger: { warn: vi.fn() },
  };
  return { deps, jobs, readJobsPaused, retentionCleanupGate };
}

describe('runScheduledJobs', () => {
  describe('heartbeat cron', () => {
    it('runs every job when not paused, reading jobs-paused once', async () => {
      const { deps, jobs, readJobsPaused } = makeDeps();

      await runScheduledJobs(HEARTBEAT_CRON, deps);

      expect(readJobsPaused).toHaveBeenCalledOnce();
      expect(jobs.heartbeat).toHaveBeenCalledWith(false);
      expect(jobs.planCleanup).toHaveBeenCalledWith(true);
      expect(jobs.regenerationSweep).toHaveBeenCalledWith(false);
    });

    it('pauses plan cleanup, the heartbeat and the sweep', async () => {
      const { deps, jobs } = makeDeps({ paused: 'paused' });

      await runScheduledJobs(HEARTBEAT_CRON, deps);

      expect(jobs.heartbeat).toHaveBeenCalledWith(true);
      expect(jobs.planCleanup).toHaveBeenCalledWith(false);
      expect(jobs.regenerationSweep).toHaveBeenCalledWith(true);
    });

    it('fails open when the jobs-paused read failed', async () => {
      const { deps, jobs } = makeDeps({ paused: 'unknown' });

      await runScheduledJobs(HEARTBEAT_CRON, deps);

      expect(jobs.planCleanup).toHaveBeenCalledWith(true);
    });

    it('runs the other jobs when one fails, then rethrows', async () => {
      const { deps, jobs } = makeDeps();
      const error = new Error('heartbeat down');
      jobs.heartbeat.mockRejectedValue(error);

      await expect(runScheduledJobs(HEARTBEAT_CRON, deps)).rejects.toBe(error);

      expect(jobs.planCleanup).toHaveBeenCalledOnce();
      expect(jobs.regenerationSweep).toHaveBeenCalledOnce();
    });
  });

  describe('retention cron', () => {
    it('passes the one jobs-paused read to the retention gate', async () => {
      const { deps, jobs, readJobsPaused, retentionCleanupGate } = makeDeps({
        paused: 'paused',
        gate: 'paused',
      });

      await runScheduledJobs(RETENTION_CLEANUP_CRON, deps);

      expect(readJobsPaused).toHaveBeenCalledOnce();
      expect(retentionCleanupGate).toHaveBeenCalledWith('paused');
      expect(jobs.retentionCleanup).toHaveBeenCalledWith('paused');
      expect(jobs.postHogDeletion).toHaveBeenCalledWith(false);
    });

    it('skips retention but still retries PostHog deletion when the jobs-paused read failed', async () => {
      const { deps, jobs, retentionCleanupGate } = makeDeps({
        paused: 'unknown',
        gate: 'flag_unavailable',
      });

      await runScheduledJobs(RETENTION_CLEANUP_CRON, deps);

      expect(retentionCleanupGate).toHaveBeenCalledWith('unknown');
      expect(jobs.retentionCleanup).toHaveBeenCalledWith('flag_unavailable');
      expect(jobs.postHogDeletion).toHaveBeenCalledWith(true);
    });

    it.each([
      ['production', true],
      ['staging', false],
      ['development', false],
    ] as const)(
      'runs PostHog deletion in %s: %s',
      async (workerEnv, expected) => {
        const { deps, jobs } = makeDeps({ workerEnv });

        await runScheduledJobs(RETENTION_CLEANUP_CRON, deps);

        expect(jobs.retentionCleanup).toHaveBeenCalledWith('run');
        expect(jobs.postHogDeletion).toHaveBeenCalledWith(expected);
      },
    );
  });

  it('logs an unknown cron and runs nothing', async () => {
    const { deps, jobs } = makeDeps();

    await runScheduledJobs('0 0 * * *', deps);

    expect(deps.logger.warn).toHaveBeenCalledWith(
      { cron: '0 0 * * *' },
      'No job for this cron',
    );
    expect(jobs.heartbeat).not.toHaveBeenCalled();
    expect(jobs.retentionCleanup).not.toHaveBeenCalled();
  });
});
