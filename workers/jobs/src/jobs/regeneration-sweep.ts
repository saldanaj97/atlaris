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
import { JOB_TYPES } from '@/features/jobs/types';
import { jobQueue } from '@supabase/schema';
import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';

/** Runs on the shared `*\/15` tick (Decision 8). */
export const REGENERATION_SWEEP_CRON = '*/15 * * * *';
/** A pending row untouched this long has lost its message. */
export const REGENERATION_SWEEP_UNTOUCHED_MINUTES = 10;
/** `sendBatch` accepts up to 100 messages; stay well under it. */
export const REGENERATION_SWEEP_BATCH_LIMIT = 50;

/**
 * Selects due `pending` regeneration rows untouched for 10 minutes and bumps
 * their `updated_at` in the same statement, so the next tick does not re-send
 * a row whose message is still queued. Highest priority, then oldest, first.
 */
export async function claimRegenerationSweepJobIds(
  db: DbClient,
  limit: number = REGENERATION_SWEEP_BATCH_LIMIT,
): Promise<string[]> {
  const due = db
    .select({ id: jobQueue.id })
    .from(jobQueue)
    .where(
      and(
        eq(jobQueue.status, 'pending'),
        eq(jobQueue.jobType, JOB_TYPES.PLAN_REGENERATION),
        lte(jobQueue.scheduledFor, sql`now()`),
        lte(
          jobQueue.updatedAt,
          sql`now() - make_interval(mins => ${REGENERATION_SWEEP_UNTOUCHED_MINUTES})`,
        ),
      ),
    )
    .orderBy(desc(jobQueue.priority), asc(jobQueue.createdAt))
    .limit(limit)
    .for('update', { skipLocked: true });

  const touched = await db
    .update(jobQueue)
    .set({ updatedAt: sql`now()` })
    .where(inArray(jobQueue.id, due))
    .returning({ id: jobQueue.id });
  return touched.map((row) => row.id);
}

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
