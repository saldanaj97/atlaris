import type { WorkerEnv } from './env';
import type {
  JobsPausedState,
  RetentionCleanupGate,
  readJobsPaused,
  retentionCleanupGate,
} from './switches';
import type { Logger } from '@/lib/logging/logger';

import { HEARTBEAT_CRON } from './jobs/heartbeat';
import { RETENTION_CLEANUP_CRON } from './jobs/retention-cleanup';

/** Each cron job, bound to its runtime deps; it takes only this tick's flag decision. */
export type ScheduledJobs = {
  readonly heartbeat: (paused: boolean) => Promise<unknown>;
  readonly planCleanup: (enabled: boolean) => Promise<unknown>;
  readonly regenerationSweep: (paused: boolean) => Promise<unknown>;
  readonly retentionCleanup: (gate: RetentionCleanupGate) => Promise<unknown>;
  readonly postHogDeletion: (enabled: boolean) => Promise<unknown>;
};

export type ScheduledDeps = {
  readonly workerEnv: WorkerEnv['WORKER_ENV'];
  readonly readJobsPaused: typeof readJobsPaused;
  readonly retentionCleanupGate: typeof retentionCleanupGate;
  readonly jobs: ScheduledJobs;
  readonly logger: Pick<Logger, 'warn'>;
};

/** Runs every job, then rethrows the first failure so the invocation fails. */
async function runIndependently(jobs: Array<() => Promise<unknown>>) {
  const results = await Promise.allSettled(jobs.map((job) => job()));
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) {
    throw failed.reason;
  }
}

/**
 * Runs the jobs for `cron`. `jobs-paused` is read once per tick; a failed
 * read counts as "not paused", except for retention cleanup, which skips.
 */
export async function runScheduledJobs(
  cron: string,
  deps: ScheduledDeps,
): Promise<void> {
  switch (cron) {
    // Every */15 job runs independently; one failure does not skip the others.
    case HEARTBEAT_CRON: {
      const paused = (await deps.readJobsPaused()) === 'paused';
      await runIndependently([
        () => deps.jobs.heartbeat(paused),
        () => deps.jobs.planCleanup(!paused),
        () => deps.jobs.regenerationSweep(paused),
      ]);
      return;
    }
    case RETENTION_CLEANUP_CRON: {
      const pausedState: JobsPausedState = await deps.readJobsPaused();
      const gate = await deps.retentionCleanupGate(pausedState);
      await runIndependently([
        () => deps.jobs.retentionCleanup(gate),
        () =>
          deps.jobs.postHogDeletion(
            pausedState !== 'paused' && deps.workerEnv === 'production',
          ),
      ]);
      return;
    }
    default:
      deps.logger.warn({ cron }, 'No job for this cron');
  }
}
