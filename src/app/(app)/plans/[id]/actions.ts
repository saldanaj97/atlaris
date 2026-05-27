'use server';

import type { PlanAccessResult } from '@/app/(app)/plans/[id]/types';
import type { ProgressStatus } from '@/shared/types/db.types';

import { planError, planSuccess } from './helpers';
import { getPlanDetailForRead } from '@/features/plans/read-projection/service';
import {
  applyTaskProgressUpdates,
  validateTaskProgressBatchInput,
} from '@/features/plans/task-progress/boundary';
import { requestBoundary } from '@/lib/api/request-boundary';
import { serializeErrorForLog } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';
import { revalidatePathsBestEffort } from '@/lib/next/revalidate-paths';

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
export async function batchUpdateTaskProgressAction({
  planId,
  updates,
}: BatchUpdateTaskProgressInput): Promise<void> {
  if (updates.length === 0) return;

  const result = await requestBoundary.action(async ({ actor, db }) => {
    validateTaskProgressBatchInput({ planId, updates });

    try {
      const outcome = await applyTaskProgressUpdates({
        userId: actor.id,
        planId,
        updates,
        dbClient: db,
      });
      revalidatePathsBestEffort(outcome.revalidatePaths);
    } catch (error) {
      logger.error(
        {
          planId,
          userId: actor.id,
          updateCount: updates.length,
          taskIds: updates.map((update) => update.taskId),
          err: serializeErrorForLog(error),
        },
        'Failed to batch update task progress',
      );
      throw new Error('Unable to update task progress right now.', {
        cause: error,
      });
    }
  });

  if (result === null) {
    throw new Error('You must be signed in to update progress.');
  }
}

/**
 * Server action to fetch plan detail data with RLS enforcement.
 * Uses `requestBoundary.action()` for auth and a request-scoped RLS `db` (see batch action comment).
 * Returns a typed result with explicit error codes for proper handling.
 *
 * Error codes:
 * - UNAUTHORIZED: User is not authenticated
 * - NOT_FOUND: Plan does not exist or user doesn't have access
 * - INTERNAL_ERROR: Unexpected error during fetch
 */
export async function getPlanForPage(
  planId: string,
): Promise<PlanAccessResult> {
  const boundaryResult = await requestBoundary.action(async ({ actor, db }) => {
    const plan = await getPlanDetailForRead({
      planId,
      userId: actor.id,
      dbClient: db,
    });
    if (!plan) {
      logger.debug(
        { planId, userId: actor.id },
        'Plan not found or user does not have access',
      );
      return planError(
        'NOT_FOUND',
        'This plan does not exist or you do not have access to it.',
      );
    }
    return planSuccess(plan);
  });

  if (!boundaryResult) {
    logger.debug({ planId }, 'Plan access denied: user not authenticated');
    return planError(
      'UNAUTHORIZED',
      'You must be signed in to view this plan.',
    );
  }
  return boundaryResult;
}
