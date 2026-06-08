import type { DbClient } from '@/lib/db/types';
import type { ProgressStatus } from '@/shared/types/db.types';

import {
  applyTaskProgressUpdates,
  validateTaskProgressBatchInput,
} from '@/features/plans/task-progress/boundary';
import { serializeErrorForLog } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';
import { revalidatePathsBestEffort } from '@/lib/next/revalidate-paths';

export type BatchUpdateTaskProgressCoreInput = {
  planId: string;
  moduleId?: string;
  updates: Array<{ taskId: string; status: ProgressStatus }>;
  userId: string;
  dbClient: DbClient;
  logContext: Record<string, unknown>;
  logMessage: string;
};

export type BatchUpdateTaskProgressCoreResult = {
  readonly revalidateFailed: boolean;
};

export async function batchUpdateTaskProgressCore(
  input: BatchUpdateTaskProgressCoreInput,
): Promise<BatchUpdateTaskProgressCoreResult> {
  validateTaskProgressBatchInput({
    planId: input.planId,
    moduleId: input.moduleId,
    updates: input.updates,
  });

  try {
    const outcome = await applyTaskProgressUpdates({
      userId: input.userId,
      planId: input.planId,
      moduleId: input.moduleId,
      updates: input.updates,
      dbClient: input.dbClient,
    });
    const { failedPaths } = revalidatePathsBestEffort(outcome.revalidatePaths);
    return { revalidateFailed: failedPaths.length > 0 };
  } catch (error) {
    logger.error(
      {
        ...input.logContext,
        err: serializeErrorForLog(error),
      },
      input.logMessage,
    );
    throw new Error('Unable to update task progress right now.', {
      cause: error,
    });
  }
}
