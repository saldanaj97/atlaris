'use server';

/**
 * Server actions for module detail page.
 *
 * RLS enforcement note:
 * - Uses authenticated RLS client to ensure proper tenant isolation
 * - Module ownership is validated through plan ownership
 */

import type { ProgressStatus } from '@/shared/types/db.types';

import { batchUpdateTaskProgressCore } from '@/features/plans/task-progress/batch-action-core';
import { requestBoundary } from '@/lib/api/request-boundary';

interface BatchUpdateModuleTaskProgressInput {
  planId: string;
  moduleId: string;
  updates: Array<{ taskId: string; status: ProgressStatus }>;
}

/**
 * Server action to batch update multiple task progress records from the module detail page.
 * Delegates validation, scope checks, persistence, and path selection to `batchUpdateTaskProgressCore`.
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

  const result = await requestBoundary.action(async ({ actor, db }) =>
    batchUpdateTaskProgressCore({
      planId,
      moduleId,
      updates,
      userId: actor.id,
      dbClient: db,
      logContext: {
        planId,
        moduleId,
        userId: actor.id,
        updateCount: updates.length,
        taskIds: updates.map((update) => update.taskId),
      },
      logMessage: 'Failed to batch update module task progress',
    }),
  );

  if (result === null) {
    throw new Error('You must be signed in to update progress.');
  }

  return result;
}
