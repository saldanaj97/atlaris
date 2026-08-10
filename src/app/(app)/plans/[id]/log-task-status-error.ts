'use client';

import type { ProgressStatus } from '@/shared/types/db.types';

import { getLoggableErrorDetails } from '@/lib/errors';
import { clientLogger } from '@/lib/logging/client';

export function logTaskStatusError({
  error,
  taskId,
  previousStatus,
  nextStatus,
  context,
}: {
  error: unknown;
  taskId: string;
  previousStatus?: ProgressStatus;
  nextStatus?: ProgressStatus;
  context?: Record<string, unknown>;
}): void {
  const { errorMessage, errorStack } = getLoggableErrorDetails(error);
  clientLogger.error('Task status update failed', {
    errorMessage,
    errorStack,
    taskId,
    ...(previousStatus !== undefined ? { previousStatus } : {}),
    ...(nextStatus !== undefined ? { nextStatus } : {}),
    ...context,
  });
}
