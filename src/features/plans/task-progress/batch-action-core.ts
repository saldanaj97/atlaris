import type { DbClient } from '@/lib/db/types';
import type { ProgressStatus } from '@/shared/types/db.types';

import { resolveUserTier } from '@/features/billing/tier';
import { enqueueFollowUpLessonsAfterProgress } from '@/features/lesson-content/progressive-enqueue';
import { assertPlanContentAccess } from '@/features/plans/entitlement/access';
import {
  applyTaskProgressUpdates,
  validateTaskProgressBatchInput,
} from '@/features/plans/task-progress/boundary';
import { getCorrelationId } from '@/lib/api/context';
import { AppError } from '@/lib/api/errors';
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

  await assertPlanContentAccess({
    userId: input.userId,
    planId: input.planId,
    dbClient: input.dbClient,
  });

  try {
    const outcome = await applyTaskProgressUpdates({
      userId: input.userId,
      planId: input.planId,
      moduleId: input.moduleId,
      updates: input.updates,
      dbClient: input.dbClient,
    });
    try {
      const currentTier = await resolveUserTier(input.userId, input.dbClient);
      await enqueueFollowUpLessonsAfterProgress({
        dbClient: input.dbClient,
        userId: input.userId,
        planId: input.planId,
        moduleId: input.moduleId,
        userTier: currentTier,
        correlationId: getCorrelationId() ?? input.planId,
      });
    } catch (error) {
      logger.warn(
        {
          ...input.logContext,
          err: serializeErrorForLog(error),
        },
        'Failed to enqueue progressive lessons after task progress',
      );
    }
    const { failedPaths } = revalidatePathsBestEffort(outcome.revalidatePaths);
    return { revalidateFailed: failedPaths.length > 0 };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
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
