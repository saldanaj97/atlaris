import { regenerationPaused } from '@/flags';
import { logger } from '@/lib/logging/logger';
import * as Sentry from '@sentry/nextjs';

/**
 * Whether the `regeneration-paused` flag stops new regeneration requests.
 * Fail open: an evaluation error means "not paused", so a Flagship outage does
 * not become a regeneration outage; per-tier quotas still cap cost. The
 * failure is reported to Sentry like the site gate's flag reads.
 */
export async function isRegenerationPaused(): Promise<boolean> {
  try {
    return await regenerationPaused();
  } catch (error: unknown) {
    const detail = 'regeneration_paused_flag evaluation failed; failing open.';
    logger.warn({ err: error }, detail);
    Sentry.withScope((scope) => {
      scope.setTag('feature', 'regeneration_paused_flag');
      scope.setTag('outcome', 'fail_open');
      scope.setExtra('detail', detail);
      const err = error instanceof Error ? error : new Error(String(error));
      Sentry.captureException(err);
    });
    return false;
  }
}
