import { regenerationPaused } from '@/flags';
import { logger } from '@/lib/logging/logger';
import * as Sentry from '@sentry/nextjs';

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
