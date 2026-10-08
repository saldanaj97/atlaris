/**
 * Selection for the jobs Worker's regeneration sweep
 * (workers/jobs/src/jobs/regeneration-sweep.ts). Kept app-side so DB tests can
 * run it without Worker runtime types.
 */
import type { DbClient } from '@/lib/db/types';

import { JOB_TYPES } from '@/features/jobs/types';
import { jobQueue } from '@supabase/schema';
import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';

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
