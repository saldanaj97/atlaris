import { generationAttempts, learningPlans } from '@/lib/db/schema';
import type { DbClient } from '@/lib/db/types';
import { logger } from '@/lib/logging/logger';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';

/** Plans stuck in 'generating' longer than this are considered abandoned. */
export const STUCK_PLAN_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

/** In-progress attempts older than this are considered orphaned. */
export const ORPHANED_ATTEMPT_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Marks plans stuck in 'generating' status for longer than the threshold as 'failed'.
 * Uses a generous threshold (15min) to avoid marking slow-but-active generations as failed.
 */
export async function cleanupStuckPlans(
  dbClient: DbClient,
  thresholdMs: number = STUCK_PLAN_THRESHOLD_MS
): Promise<{ cleaned: number }> {
  const cutoff = new Date(Date.now() - thresholdMs);

  const result = await dbClient
    .update(learningPlans)
    .set({
      generationStatus: 'failed',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(learningPlans.generationStatus, 'generating'),
        lt(learningPlans.updatedAt, cutoff)
      )
    );

  const cleaned = result.count ?? 0;

  if (cleaned > 0) {
    logger.info(
      { source: 'cleanup', event: 'stuck_plans_cleaned', count: cleaned },
      `Marked ${cleaned} stuck plan(s) as failed`
    );
  }

  return { cleaned };
}

/**
 * Finalizes orphaned 'in_progress' generation attempts older than the threshold.
 * Sets classification to 'timeout' for attempts that were never completed.
 */
export async function cleanupOrphanedAttempts(
  dbClient: DbClient,
  thresholdMs: number = ORPHANED_ATTEMPT_THRESHOLD_MS
): Promise<{ cleaned: number }> {
  const cutoff = new Date(Date.now() - thresholdMs);

  const result = await dbClient
    .update(generationAttempts)
    .set({
      classification: 'timeout',
      status: sql<string>`'failure'`,
    })
    .where(
      and(
        isNull(generationAttempts.classification),
        eq(generationAttempts.status, 'in_progress'),
        lt(generationAttempts.createdAt, cutoff)
      )
    );

  const cleaned = result.count ?? 0;

  if (cleaned > 0) {
    logger.info(
      {
        source: 'cleanup',
        event: 'orphaned_attempts_cleaned',
        count: cleaned,
      },
      `Finalized ${cleaned} orphaned attempt(s)`
    );
  }

  return { cleaned };
}
