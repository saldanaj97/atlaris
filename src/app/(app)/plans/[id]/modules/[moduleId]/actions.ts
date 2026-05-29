'use server';

/**
 * Server actions for module detail page.
 *
 * RLS enforcement note:
 * - Uses authenticated RLS client to ensure proper tenant isolation
 * - Module ownership is validated through plan ownership
 */

import type { ProgressStatus } from '@/shared/types/db.types';

import {
  applyTaskProgressUpdates,
  validateTaskProgressBatchInput,
} from '@/features/plans/task-progress/boundary';
import { requestBoundary } from '@/lib/api/request-boundary';
import { serializeErrorForLog } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';
import { revalidatePathsBestEffort } from '@/lib/next/revalidate-paths';

interface BatchUpdateModuleTaskProgressInput {
  planId: string;
  moduleId: string;
  updates: Array<{ taskId: string; status: ProgressStatus }>;
}

/**
 * Server action to batch update multiple task progress records from the module detail page.
 * Delegates validation, scope checks, persistence, and path selection to `applyTaskProgressUpdates`.
 */
export type BatchUpdateModuleTaskProgressResult = {
  readonly revalidateFailed: boolean;
};

export async function batchUpdateModuleTaskProgressAction({
  planId,
  moduleId,
  updates,
}: BatchUpdateModuleTaskProgressInput): Promise<BatchUpdateModuleTaskProgressResult | void> {
  if (updates.length === 0) return;

  const result = await requestBoundary.action(async ({ actor, db }) => {
    validateTaskProgressBatchInput({ planId, moduleId, updates });

    try {
      const outcome = await applyTaskProgressUpdates({
        userId: actor.id,
        planId,
        moduleId,
        updates,
        dbClient: db,
      });
      const { failedPaths } = revalidatePathsBestEffort(
        outcome.revalidatePaths,
      );
      return { revalidateFailed: failedPaths.length > 0 };
    } catch (error) {
      logger.error(
        {
          planId,
          moduleId,
          userId: actor.id,
          updateCount: updates.length,
          taskIds: updates.map((update) => update.taskId),
          err: serializeErrorForLog(error),
        },
        'Failed to batch update module task progress',
      );
      throw new Error('Unable to update task progress right now.', {
        cause: error,
      });
    }
  });

  if (result === null) {
    throw new Error('You must be signed in to update progress.');
  }

  return result;
}
