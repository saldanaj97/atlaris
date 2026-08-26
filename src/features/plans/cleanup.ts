import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
// Use the store function directly so failure
// updates run on the same transaction handle as SELECT … FOR UPDATE.
import type { DbClient } from '@/lib/db/types';

import { markPlanGenerationFailuresInTx } from '@/features/plans/lifecycle/plan-persistence-store';
import { lockPlanLifecycle } from '@/lib/db/queries/helpers/plan-lifecycle-lock';
import { logger } from '@/lib/logging/logger';
import { generationAttempts, learningPlans, modules } from '@supabase/schema';
import { db as serviceRoleDb } from '@supabase/service-role';
import { sql } from 'drizzle-orm';

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

/** Module lesson generations with a durable provider-start marker use the same maintenance window. */
export const ORPHANED_MODULE_LESSON_GENERATION_THRESHOLD_MS =
  ORPHANED_ATTEMPT_THRESHOLD_MS;

/** Keep provider-started module reconciliation bounded like the existing cleanup batches. */
export const ORPHANED_MODULE_LESSON_GENERATION_CLEANUP_BATCH_SIZE =
  ORPHANED_ATTEMPT_CLEANUP_BATCH_SIZE;

export const ABANDONED_MODULE_LESSON_GENERATION_ERROR =
  'Provider-started lesson generation was interrupted; retry required.';

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
        status: 'failure',
      })
      .where(inArray(generationAttempts.id, attemptIds))
      .returning({ id: generationAttempts.id });

    const cleanedAttemptIds = result.map((attempt) => attempt.id);
    const cleaned = cleanedAttemptIds.length;

    if (cleaned !== attemptIds.length) {
      logger.error(
        {
          source: 'cleanup',
          event: 'orphaned_attempts_cleanup_partial_failure',
          expected: attemptIds.length,
          cleaned,
        },
        'Plan cleanup failed to finalize all locked orphaned attempts',
      );
      throw new Error(
        'Plan cleanup failed to finalize all locked orphaned attempts',
      );
    }

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

type CleanupAbandonedModuleLessonGenerationsDependencies = {
  batchSize?: number;
};

/**
 * Settles stale module work that durably crossed the provider boundary before a
 * worker disappeared. This only changes the module lifecycle state.
 */
export async function cleanupAbandonedModuleLessonGenerations(
  dbClient: DbClient,
  thresholdMs: number = ORPHANED_MODULE_LESSON_GENERATION_THRESHOLD_MS,
  deps: CleanupAbandonedModuleLessonGenerationsDependencies = {},
): Promise<{ cleaned: number }> {
  const cutoff = new Date(Date.now() - thresholdMs);
  const batchSize =
    deps.batchSize ?? ORPHANED_MODULE_LESSON_GENERATION_CLEANUP_BATCH_SIZE;
  const providerStarted = sql`${modules.lessonGenerationMetadata}->>'providerStartedAt' IS NOT NULL`;
  const staleProviderStarted = and(
    eq(modules.lessonGenerationStatus, 'generating'),
    lt(modules.lessonGenerationStartedAt, cutoff),
    providerStarted,
  );

  return dbClient.transaction(async (tx) => {
    // Lock the shared plan lifecycle key before locking module rows so cleanup
    // cannot race child claims, parent deletion, or parent replacement.
    const candidatePlans = await tx
      .select({ planId: modules.planId })
      .from(modules)
      .where(staleProviderStarted)
      .limit(batchSize);
    const planIds = [
      ...new Set(candidatePlans.map((row) => row.planId)),
    ].sort();

    for (const planId of planIds) {
      await lockPlanLifecycle(tx, planId);
    }

    if (planIds.length === 0) {
      return { cleaned: 0 };
    }

    const abandonedModules = await tx
      .select({ id: modules.id })
      .from(modules)
      .where(and(staleProviderStarted, inArray(modules.planId, planIds)))
      .limit(batchSize)
      .for('update');

    if (abandonedModules.length === 0) {
      return { cleaned: 0 };
    }

    const abandonedModuleIds = abandonedModules.map((module) => module.id);
    const failedAt = new Date();
    const result = await tx
      .update(modules)
      .set({
        lessonGenerationStatus: 'failed',
        lessonGenerationFailedAt: failedAt,
        lessonGenerationCompletedAt: null,
        lessonGenerationError: ABANDONED_MODULE_LESSON_GENERATION_ERROR,
      })
      .where(and(inArray(modules.id, abandonedModuleIds), staleProviderStarted))
      .returning({ id: modules.id });

    if (result.length !== abandonedModuleIds.length) {
      logger.error(
        {
          source: 'cleanup',
          event: 'abandoned_module_lesson_generation_cleanup_partial_failure',
          expected: abandonedModuleIds.length,
          cleaned: result.length,
        },
        'Plan cleanup failed to settle all abandoned provider-started module generations',
      );
      throw new Error(
        'Plan cleanup failed to settle all abandoned provider-started module generations',
      );
    }

    logger.info(
      {
        source: 'cleanup',
        event: 'abandoned_module_lesson_generations_cleaned',
        count: result.length,
      },
      `Settled ${result.length} abandoned provider-started module generation(s)`,
    );

    if (result.length === batchSize) {
      logger.warn(
        {
          source: 'cleanup',
          event: 'abandoned_module_lesson_generation_cleanup_batch_full',
          batchSize,
        },
        'Plan cleanup filled its abandoned module-generation batch; backlog may remain',
      );
    }

    return { cleaned: result.length };
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
  await cleanupAbandonedModuleLessonGenerations(serviceRoleDb);

  return {
    stuckPlansCleaned: stuckPlans.cleaned,
    orphanedAttemptsCleaned: orphanedAttempts.cleaned,
  };
}
