import type { DbClient } from '@/lib/db/types';
import type { Logger } from '@/lib/logging/logger';
import type { captureException as sentryCaptureException } from '@sentry/cloudflare';

import { cleanupRetainedDbRows } from '@/lib/db/queries/admin/retention';

export const RETENTION_CLEANUP_CRON = '0 3 * * *';
export const RETENTION_CLEANUP_JOB = 'retention-cleanup';

export type RetentionCleanupDeps = {
  /** `isJobEnabled(env, 'RETENTION_CLEANUP')`: false when switched off or paused. */
  enabled: boolean;
  logger: Pick<Logger, 'info'>;
  /** Runs `fn` with this invocation's database client. */
  withDb: <T>(fn: (db: DbClient) => Promise<T>) => Promise<T>;
  captureException: typeof sentryCaptureException;
  now?: () => Date;
};

export type RetentionCleanupResult =
  | 'skipped'
  | Awaited<ReturnType<typeof cleanupRetainedDbRows>>;

/** Runs `private.cleanup_retained_db_rows` through the invocation's client. */
export async function runRetentionCleanup(
  deps: RetentionCleanupDeps,
): Promise<RetentionCleanupResult> {
  if (!deps.enabled) {
    deps.logger.info(
      { job: RETENTION_CLEANUP_JOB },
      'Retention cleanup disabled or jobs paused; skipped',
    );
    return 'skipped';
  }

  try {
    const result = await deps.withDb((db) =>
      cleanupRetainedDbRows({ now: deps.now?.(), dbClient: db }),
    );
    deps.logger.info(
      { job: RETENTION_CLEANUP_JOB, ...result },
      'Completed retention cleanup',
    );
    return result;
  } catch (error) {
    deps.captureException(error, {
      tags: { job: RETENTION_CLEANUP_JOB, runtime: 'cloudflare-worker' },
    });
    throw error;
  }
}
