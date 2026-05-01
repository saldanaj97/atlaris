import { AppError } from '@/lib/api/errors';
import { serializeErrorForLog } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';
import { safeMarkPlanFailedWithDbClient } from './stream-cleanup';

export const DEFAULT_PROVIDER_FAILURE_CLASSIFICATION =
  'provider_error' as const;

export type UnhandledGenerationErrorHandler = (
  error: unknown,
  startedAt: number,
  dbClient: AttemptsDbClient,
) => Promise<void>;

/**
 * Idempotent wrapper for stream-scoped DB `cleanup()`.
 */
export function createSafeStreamCleanup(
  authUserId: string,
  cleanup: () => Promise<void>,
): () => Promise<void> {
  let closed = false;

  return async () => {
    if (closed) {
      return;
    }
    closed = true;

    try {
      await cleanup();
    } catch (error) {
      logger.error({ authUserId, error }, 'Failed to close stream DB client');
    }
  };
}

export async function handleUnhandledStreamError({
  error,
  startedAt,
  dbClient,
  planId,
  userId,
  classification,
  message,
}: {
  error: unknown;
  startedAt: number;
  dbClient: AttemptsDbClient;
  planId: string;
  userId: string;
  classification: FailureClassification;
  message: string;
}): Promise<void> {
  logger.error(
    {
      planId,
      userId,
      classification,
      durationMs: Math.max(0, Date.now() - startedAt),
      error: serializeErrorForLog(error),
    },
    message,
  );

  await safeMarkPlanFailedWithDbClient(planId, userId, dbClient);
}

export function classifyUnhandledGenerationError(
  error: unknown,
): FailureClassification {
  if (error instanceof AppError) {
    return error.classification() ?? DEFAULT_PROVIDER_FAILURE_CLASSIFICATION;
  }

  if (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  ) {
    return 'timeout';
  }

  return DEFAULT_PROVIDER_FAILURE_CLASSIFICATION;
}
