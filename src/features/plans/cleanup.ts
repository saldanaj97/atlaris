import { and, eq, isNull, lt, sql } from 'drizzle-orm';
// Use the store function directly (not PlanPersistenceAdapter) so failure
// updates run on the same transaction handle as SELECT … FOR UPDATE.
import type { DbClient } from '@/lib/db/types';

import { markPlanGenerationFailuresInTx } from '@/features/plans/lifecycle/adapters/plan-persistence-store';
import { logger } from '@/lib/logging/logger';
import { generationAttempts, learningPlans } from '@supabase/schema';
import { db as serviceRoleDb } from '@supabase/service-role';

/** Plans stuck in 'generating' longer than this are considered abandoned. */
export const STUCK_PLAN_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

/** In-progress attempts older than this are considered orphaned. */
export const ORPHANED_ATTEMPT_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Marks plans stuck in 'generating' status for longer than the threshold as 'failed'.
 * Uses a generous threshold (15min) to avoid marking slow-but-active generations as failed.
 * Rows are locked inside a transaction before failure transitions so cleanup
 * does not race concurrent generation state updates.
 */
type CleanupStuckPlansDependencies = {
  markFailuresInTx?: typeof markPlanGenerationFailuresInTx;
};

export async function cleanupStuckPlans(
  dbClient: DbClient,
  thresholdMs: number = STUCK_PLAN_THRESHOLD_MS,
  deps: CleanupStuckPlansDependencies = {},
): Promise<{ cleaned: number }> {
  const cutoff = new Date(Date.now() - thresholdMs);
  const markFailuresInTx =
    deps.markFailuresInTx ?? markPlanGenerationFailuresInTx;

  return dbClient.transaction(async (tx) => {
    const stuckPlans = await tx
      .select({ id: learningPlans.id })
      .from(learningPlans)
      .where(
        and(
          eq(learningPlans.generationStatus, 'generating'),
          lt(learningPlans.updatedAt, cutoff),
        ),
      )
      .limit(Number.MAX_SAFE_INTEGER)
      .for('update');

    if (stuckPlans.length === 0) {
      return { cleaned: 0 };
    }

    const timestamp = new Date();
    const planIds = stuckPlans.map((plan) => plan.id);
    const cleaned = await markFailuresInTx(tx, planIds, timestamp);

    if (cleaned !== planIds.length) {
      logger.error(
        {
          source: 'cleanup',
          event: 'stuck_plans_cleanup_partial_failure',
          expected: planIds.length,
          cleaned,
        },
        'Plan cleanup failed to mark all locked stuck plans as failed',
      );
      throw new Error(
        'Plan cleanup failed to mark all locked stuck plans as failed',
      );
    }

    if (cleaned > 0) {
      logger.info(
        { source: 'cleanup', event: 'stuck_plans_cleaned', count: cleaned },
        `Marked ${cleaned} stuck plan(s) as failed`,
      );
    }

    return { cleaned };
  });
}

/**
 * Finalizes orphaned 'in_progress' generation attempts older than the threshold.
 * Sets classification to 'timeout' for attempts that were never completed.
 */
export async function cleanupOrphanedAttempts(
  dbClient: DbClient,
  thresholdMs: number = ORPHANED_ATTEMPT_THRESHOLD_MS,
): Promise<{ cleaned: number }> {
  const cutoff = new Date(Date.now() - thresholdMs);

  const result = await dbClient
    .update(generationAttempts)
    .set({
      classification: 'timeout',
      // Raw SQL literal — the generation_attempts.status column uses a DB enum
      // whose TypeScript type doesn't include 'failure' directly.
      status: sql<string>`'failure'`,
    })
    .where(
      and(
        isNull(generationAttempts.classification),
        eq(generationAttempts.status, 'in_progress'),
        lt(generationAttempts.createdAt, cutoff),
      ),
    )
    .returning({ id: generationAttempts.id });

  const cleaned = result.length;

  if (cleaned > 0) {
    logger.info(
      {
        source: 'cleanup',
        event: 'orphaned_attempts_cleaned',
        count: cleaned,
      },
      `Finalized ${cleaned} orphaned attempt(s)`,
    );
  }

  return { cleaned };
}

/**
 * Service-role entrypoint for the internal plan cleanup maintenance route.
 */
export async function runPlanCleanupMaintenance(): Promise<{
  stuckPlansCleaned: number;
  orphanedAttemptsCleaned: number;
}> {
  const stuckPlans = await cleanupStuckPlans(serviceRoleDb);
  const orphanedAttempts = await cleanupOrphanedAttempts(serviceRoleDb);

  return {
    stuckPlansCleaned: stuckPlans.cleaned,
    orphanedAttemptsCleaned: orphanedAttempts.cleaned,
  };
}
