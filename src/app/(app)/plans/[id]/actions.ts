'use server';

import type { ProgressStatus } from '@/shared/types/db.types';

import { batchUpdateTaskProgressCore } from '@/features/plans/task-progress/batch-action-core';
import { requestBoundary } from '@/lib/api/request-boundary';

interface BatchUpdateTaskProgressInput {
  planId: string;
  updates: Array<{ taskId: string; status: ProgressStatus }>;
}

/**
 * Server action to batch update multiple task progress records from the plan overview page.
 * Delegates validation, scope checks, persistence, and path selection to `applyTaskProgressUpdates`.
 *
 * Auth and RLS boundary:
 * - Wrapped by `requestBoundary.action()`, which runs `withServerActionContext()` before the callback.
 * - That boundary authenticates via `getEffectiveAuthUserId({ strict: true })` and, outside test runtime,
 *   installs a request-scoped RLS Drizzle client into request context (`runWithAuthenticatedContext`).
 * - The callback receives `actor` and `db` from the boundary; pass `db` to query functions instead of
 *   calling `getDb()` ad hoc inside the action.
 * - Query-layer ownership checks (e.g. in `applyTaskProgressUpdates`) remain required for defense in depth.
 *
 * React Doctor note: `server-auth-actions` is a false positive for actions using this wrapper.
 */
export type BatchUpdateTaskProgressResult = {
  readonly revalidateFailed: boolean;
};

export async function batchUpdateTaskProgressAction({
  planId,
  updates,
}: BatchUpdateTaskProgressInput): Promise<BatchUpdateTaskProgressResult | void> {
  if (updates.length === 0) return;

  const result = await requestBoundary.action(async ({ actor, db }) =>
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
