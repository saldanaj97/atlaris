import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
// Use the store function directly (not PlanPersistenceAdapter) so failure
// updates run on the same transaction handle as SELECT … FOR UPDATE.
import type { DbClient } from '@/lib/db/types';

import { markPlanGenerationFailuresInTx } from '@/features/plans/lifecycle/adapters/plan-persistence-store';
import { logger } from '@/lib/logging/logger';
import { generationAttempts, learningPlans } from '@supabase/schema';
import { db as serviceRoleDb } from '@supabase/service-role';

/** Plans stuck in 'generating' longer than this are considered abandoned. */
export const STUCK_PLAN_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Max stuck plans processed per cleanup run. At the 15-minute scheduler cadence
 * this drains up to 4,000 plans/hour while keeping each transaction bounded.
 */
export const STUCK_PLAN_CLEANUP_BATCH_SIZE = 1000;

/** In-progress attempts older than this are considered orphaned. */
export const ORPHANED_ATTEMPT_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Max orphaned attempts processed per cleanup run. Matches stuck-plan batching so
 * each maintenance transaction stays bounded.
 */
export const ORPHANED_ATTEMPT_CLEANUP_BATCH_SIZE = 1000;

/**
 * Marks plans stuck in 'generating' status for longer than the threshold as 'failed'.
 * Uses a generous threshold (15min) to avoid marking slow-but-active generations as failed.
 * Rows are locked inside a transaction before failure transitions so cleanup
 * does not race concurrent generation state updates.
 */
type CleanupStuckPlansDependencies = {
  markFailuresInTx?: typeof markPlanGenerationFailuresInTx;
  batchSize?: number;
};

export async function cleanupStuckPlans(
  dbClient: DbClient,
  thresholdMs: number = STUCK_PLAN_THRESHOLD_MS,
  deps: CleanupStuckPlansDependencies = {},
): Promise<{ cleaned: number }> {
  const cutoff = new Date(Date.now() - thresholdMs);
  const markFailuresInTx =
    deps.markFailuresInTx ?? markPlanGenerationFailuresInTx;
  const batchSize = deps.batchSize ?? STUCK_PLAN_CLEANUP_BATCH_SIZE;

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
      .limit(batchSize)
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

    if (cleaned === batchSize) {
      logger.warn(
        {
          source: 'cleanup',
          event: 'stuck_plans_cleanup_batch_full',
          batchSize,
        },
        'Plan cleanup filled its stuck-plan batch; backlog may remain',
      );
    }

    return { cleaned };
  });
}

type CleanupOrphanedAttemptsDependencies = {
  batchSize?: number;
};

/**
 * Finalizes orphaned 'in_progress' generation attempts older than the threshold.
 * Sets classification to 'timeout' for attempts that were never completed.
 * Rows are locked inside a transaction before updates so cleanup does not race
 * concurrent generation state updates.
 */
export async function cleanupOrphanedAttempts(
  dbClient: DbClient,
  thresholdMs: number = ORPHANED_ATTEMPT_THRESHOLD_MS,
  deps: CleanupOrphanedAttemptsDependencies = {},
): Promise<{ cleaned: number }> {
  const cutoff = new Date(Date.now() - thresholdMs);
  const batchSize = deps.batchSize ?? ORPHANED_ATTEMPT_CLEANUP_BATCH_SIZE;

  return dbClient.transaction(async (tx) => {
    const orphanedAttempts = await tx
      .select({ id: generationAttempts.id })
      .from(generationAttempts)
      .where(
        and(
          isNull(generationAttempts.classification),
          eq(generationAttempts.status, 'in_progress'),
          lt(generationAttempts.createdAt, cutoff),
        ),
      )
      .limit(batchSize)
      .for('update');

    if (orphanedAttempts.length === 0) {
      return { cleaned: 0 };
    }

    const attemptIds = orphanedAttempts.map((attempt) => attempt.id);

    const result = await tx
      .update(generationAttempts)
      .set({
        classification: 'timeout',
        // Raw SQL literal — the generation_attempts.status column uses a DB enum
        // whose TypeScript type doesn't include 'failure' directly.
        status: sql<string>`'failure'`,
      })
      .where(inArray(generationAttempts.id, attemptIds))
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

    if (cleaned === batchSize) {
      logger.warn(
        {
          source: 'cleanup',
          event: 'orphaned_attempts_cleanup_batch_full',
          batchSize,
        },
        'Plan cleanup filled its orphaned-attempt batch; backlog may remain',
      );
    }

    return { cleaned };
  });
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
