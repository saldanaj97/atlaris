import type { RetentionCleanupGate } from '../switches';
import type { DbClient } from '@/lib/db/types';
import type { Logger } from '@/lib/logging/logger';
import type { captureException as sentryCaptureException } from '@sentry/cloudflare';

import { cleanupRetainedDbRows } from '@/lib/db/queries/admin/retention';

export const RETENTION_CLEANUP_CRON = '0 3 * * *';
export const RETENTION_CLEANUP_JOB = 'retention-cleanup';

export type RetentionCleanupDeps = {
  /** `retentionCleanupGate()`: `run`, or why this run skips. */
  gate: RetentionCleanupGate;
  logger: Pick<Logger, 'info' | 'warn'>;
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
  switch (deps.gate) {
    case 'run':
      break;
    case 'paused':
      deps.logger.info(
        { job: RETENTION_CLEANUP_JOB },
        'Jobs paused; retention cleanup skipped',
      );
      return 'skipped';
    case 'disabled':
      deps.logger.info(
        { job: RETENTION_CLEANUP_JOB },
        'Retention cleanup disabled; skipped',
      );
      return 'skipped';
    case 'flag_unavailable':
      deps.logger.warn(
        { job: RETENTION_CLEANUP_JOB },
        'Retention cleanup skipped: a flag could not be read',
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
