import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';

import { safeMarkPlanFailedWithDbClient } from './stream-cleanup';
import { AppError } from '@/lib/api/errors';
import { serializeErrorForLog } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';

export type UnhandledGenerationErrorClassification =
  | FailureClassification
  | 'unknown';

export type UnhandledGenerationErrorHandler = (
  error: unknown,
  startedAt: number,
  dbClient: AttemptsDbClient,
) => Promise<void>;

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
  classification: UnhandledGenerationErrorClassification;
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
): UnhandledGenerationErrorClassification {
  if (error instanceof AppError) {
    return error.classification() ?? 'unknown';
  }

  if (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  ) {
    return 'timeout';
  }

  return 'unknown';
}
