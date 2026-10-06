import type { DbClient } from '@/lib/db/types';
import type { Logger } from '@/lib/logging/logger';
import type { captureException as sentryCaptureException } from '@sentry/cloudflare';

import { runPlanCleanupMaintenance } from '@/features/plans/cleanup';

export const PLAN_CLEANUP_CRON = '*/15 * * * *';
export const PLAN_CLEANUP_JOB = 'plan-cleanup';

export type PlanCleanupDeps = {
  /** `isJobEnabled(env, 'PLAN_CLEANUP')`: false when switched off or paused. */
  enabled: boolean;
  logger: Pick<Logger, 'info'>;
  /** Runs `fn` with this invocation's database client. */
  withDb: <T>(fn: (db: DbClient) => Promise<T>) => Promise<T>;
  captureException: typeof sentryCaptureException;
};

export type PlanCleanupResult =
  | 'skipped'
  | { stuckPlansCleaned: number; orphanedAttemptsCleaned: number };

/**
 * Marks stuck plans failed and finalizes orphaned attempts, with the same
 * bounds as the internal maintenance route. Inside `withDb`, the service-role
 * `db` that the domain function reads resolves to the invocation's client.
 */
export async function runPlanCleanup(
  deps: PlanCleanupDeps,
): Promise<PlanCleanupResult> {
  if (!deps.enabled) {
    deps.logger.info(
      { job: PLAN_CLEANUP_JOB },
      'Plan cleanup disabled or jobs paused; skipped',
    );
    return 'skipped';
  }

  try {
    const result = await deps.withDb(() => runPlanCleanupMaintenance());
    deps.logger.info({ job: PLAN_CLEANUP_JOB, ...result }, 'Completed plan cleanup');
    return result;
  } catch (error) {
    deps.captureException(error, {
      tags: { job: PLAN_CLEANUP_JOB, runtime: 'cloudflare-worker' },
    });
    throw error;
  }
}
