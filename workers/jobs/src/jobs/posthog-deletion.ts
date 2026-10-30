import type { DbClient } from '@/lib/db/types';
import type { Logger } from '@/lib/logging/logger';
import type { captureException as sentryCaptureException } from '@sentry/cloudflare';

import { retryPostHogPersonDeletions } from '@/features/auth/posthog-person-deletion';

export const POSTHOG_DELETION_JOB = 'posthog-deletion';

export type PostHogDeletionDeps = {
  /** Production only (`WORKER_ENV`) and not paused: staging never calls PostHog. */
  enabled: boolean;
  /** Production-only Worker secret; staging has none. */
  apiKey: string | undefined;
  logger: Pick<Logger, 'error' | 'info'>;
  /** Runs `fn` with this invocation's database client. */
  withDb: <T>(fn: (db: DbClient) => Promise<T>) => Promise<T>;
  captureException: typeof sentryCaptureException;
  now?: () => Date;
};

/**
 * Retries PostHog person deletion for deleted accounts whose in-app or
 * webhook attempt failed, so a PostHog outage cannot leave analytics data
 * behind. Runs daily with retention cleanup.
 */
export async function runPostHogDeletion(
  deps: PostHogDeletionDeps,
): Promise<'skipped' | { deleted: number }> {
  if (!deps.enabled) {
    deps.logger.info(
      { job: POSTHOG_DELETION_JOB },
      'PostHog deletion retry skipped outside production or while jobs are paused',
    );
    return 'skipped';
  }

  try {
    const { apiKey } = deps;
    if (!apiKey) {
      throw new Error('POSTHOG_PERSONAL_API_KEY is not set');
    }
    const result = await deps.withDb((db) =>
      retryPostHogPersonDeletions({
        apiKey,
        db,
        logger: deps.logger,
        now: deps.now?.(),
      }),
    );
    deps.logger.info(
      { job: POSTHOG_DELETION_JOB, ...result },
      'Completed PostHog deletion retry',
    );
    return result;
  } catch (error) {
    deps.captureException(error, {
      tags: { job: POSTHOG_DELETION_JOB, runtime: 'cloudflare-worker' },
    });
    throw error;
  }
}
