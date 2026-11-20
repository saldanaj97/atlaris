'use server';

import type { ProgressStatus } from '@/shared/types/db.types';

import {
  batchUpdateTaskProgressCore,
  type BatchUpdateTaskProgressCoreResult,
} from '@/features/plans/task-progress/batch-action-core';
import { requestBoundary } from '@/lib/api/request-boundary';

interface BatchUpdateTaskProgressInput {
  planId: string;
  updates: Array<{ taskId: string; status: ProgressStatus }>;
}

export async function batchUpdateTaskProgressAction({
  planId,
  updates,
}: BatchUpdateTaskProgressInput): Promise<BatchUpdateTaskProgressCoreResult | void> {
  if (updates.length === 0) return;

  const result = await requestBoundary.action(
    { rateLimit: 'mutation' },
    async ({ actor, db }) =>
      batchUpdateTaskProgressCore({
        planId,
        updates,
        userId: actor.id,
        dbClient: db,
        logContext: {
          planId,
          userId: actor.id,
          updateCount: updates.length,
          taskIds: updates.map((update) => update.taskId),
        },
        logMessage: 'Failed to batch update task progress',
      }),
  );

  if (result === null) {
    throw new Error('You must be signed in to update progress.');
  }

  return result;
}
