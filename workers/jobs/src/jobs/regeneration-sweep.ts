import type { JobSwitchVars } from '../env';
import type {
  CaptureException,
  RegenerationQueue,
} from './regeneration-shared';
import type { DbClient } from '@/lib/db/types';
import type { Logger } from '@/lib/logging/logger';

import {
  readRegenerationSwitch,
  REGENERATION_JOB_TAG,
  REGENERATION_SENTRY_TAGS,
} from './regeneration-shared';
import { claimRegenerationSweepJobIds } from '@/features/jobs/regeneration-sweep-query';

/** Runs on the shared `*\/15` tick (Decision 8). */
export const REGENERATION_SWEEP_CRON = '*/15 * * * *';

export type RegenerationSweepDeps = {
  readonly env: JobSwitchVars;
  readonly logger: Pick<Logger, 'info'>;
  readonly captureException: CaptureException;
  readonly withDb: <T>(fn: (db: DbClient) => Promise<T>) => Promise<T>;
  readonly queue: Pick<RegenerationQueue, 'sendBatch'>;
  readonly claimJobIds?: typeof claimRegenerationSweepJobIds;
};

export type RegenerationSweepResult =
  | { readonly kind: 'skipped'; readonly switchState: 'paused' | 'disabled' }
  | { readonly kind: 'swept'; readonly resent: number };

/**
 * Re-sends lost regeneration work: `job_queue` is the durable record, and a
 * failed app enqueue call or an exhausted message only delays a job until
 * this tick (Decision 8). Skips while the job is paused or disabled.
 */
export async function runRegenerationSweep(
  deps: RegenerationSweepDeps,
): Promise<RegenerationSweepResult> {
  const switchState = readRegenerationSwitch(deps.env);
  if (switchState !== 'enabled') {
    deps.logger.info(
      { job: REGENERATION_JOB_TAG, switchState },
      'Regeneration sweep skipped while the job is off',
    );
    return { kind: 'skipped', switchState };
  }

  const claimJobIds = deps.claimJobIds ?? claimRegenerationSweepJobIds;
  try {
    const jobIds = await deps.withDb((db) => claimJobIds(db));
    if (jobIds.length > 0) {
      await deps.queue.sendBatch(
        jobIds.map((jobId) => ({ body: { v: 1 as const, jobId } })),
      );
    }
    deps.logger.info(
      { job: REGENERATION_JOB_TAG, resent: jobIds.length },
      'Regeneration sweep finished',
    );
    return { kind: 'swept', resent: jobIds.length };
  } catch (error) {
    deps.captureException(error, {
      tags: REGENERATION_SENTRY_TAGS,
      extra: { phase: 'sweep' },
    });
    throw error;
  }
}
