import { getCorrelationId } from '@/lib/api/context';
import { appEnv } from '@/lib/config/env';
import type { AttemptError } from '@/lib/db/queries/types/attempts.types';
import { logger } from '@/lib/logging/logger';

function getProviderErrorStatus(
  attemptErr: AttemptError | null | undefined
): number | undefined {
  if (!attemptErr) return undefined;

  const responseStatus =
    'response' in attemptErr &&
    typeof attemptErr.response === 'object' &&
    attemptErr.response !== null &&
    'status' in attemptErr.response &&
    typeof attemptErr.response.status === 'number' &&
    Number.isFinite(attemptErr.response.status)
      ? attemptErr.response.status
      : undefined;

  const candidates = [
    'status' in attemptErr ? attemptErr.status : undefined,
    'statusCode' in attemptErr ? attemptErr.statusCode : undefined,
    'httpStatus' in attemptErr ? attemptErr.httpStatus : undefined,
    responseStatus,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export function isProviderErrorRetryable(
  attemptErr: AttemptError | null | undefined
): boolean {
  if (attemptErr == null) return true;
  const status = getProviderErrorStatus(attemptErr);
  if (status === undefined) return true;
  if (status >= 500) return true;
  if (status >= 400 && status < 500) return false;
  return true;
}

export function logAttemptEvent(
  event: 'success' | 'failure',
  payload: Record<string, unknown>
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
    `attempts_${event}`
  );

  if (appEnv.isTest) {
    // eslint-disable-next-line no-console
    console.info(`[attempts] ${event}`, enriched);
  }
}
