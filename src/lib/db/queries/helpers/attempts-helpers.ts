import { getCorrelationId } from '@/lib/api/context';
import { appEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';

export function logAttemptEvent(
  event: 'success' | 'failure',
  payload: Record<string, unknown>,
): void {
  const correlationId = getCorrelationId();
  const enriched = {
    ...payload,
    correlationId: correlationId ?? null,
  } satisfies Record<string, unknown>;
  logger.info(
    {
      source: 'attempts',
      event,
      ...enriched,
    },
    `attempts_${event}`,
  );

  if (appEnv.isTest) {
    console.info(`[attempts] ${event}`, enriched);
  }
}
