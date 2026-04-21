'use server';

/**
 * Server actions for module detail page.
 *
 * RLS enforcement note:
 * - Uses authenticated RLS client to ensure proper tenant isolation
 * - Module ownership is validated through plan ownership
 */

import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import {
  moduleError,
  moduleSuccess,
} from '@/app/plans/[id]/modules/[moduleId]/helpers';
import type { ModuleAccessResult } from '@/app/plans/[id]/modules/[moduleId]/types';
import {
  type getDb,
  learningPlans,
  logger,
  modules,
  PROGRESS_STATUSES,
  type ProgressStatus,
  setTaskProgressBatch,
  tasks,
} from '@/app/plans/[id]/server/task-progress-action-deps';
import { requestBoundary } from '@/lib/api/request-boundary';
import { getModuleDetail } from '@/lib/db/queries/modules';

async function ensureBatchModuleTaskOwnership(
  db: ReturnType<typeof getDb>,
  planId: string,
  moduleId: string,
  taskIds: string[],
  userId: string
): Promise<void> {
  const uniqueTaskIds = Array.from(new Set(taskIds));
  if (uniqueTaskIds.length === 0) return;

  const ownedTasks = await db
    .select({ taskId: tasks.id })
    .from(tasks)
    .innerJoin(modules, eq(tasks.moduleId, modules.id))
    .innerJoin(learningPlans, eq(modules.planId, learningPlans.id))
    .where(
      and(
        inArray(tasks.id, uniqueTaskIds),
        eq(modules.id, moduleId),
        eq(learningPlans.id, planId),
        eq(learningPlans.userId, userId)
      )
    );

  if (ownedTasks.length !== uniqueTaskIds.length) {
    throw new Error('One or more tasks not found.');
  }
}

function assertNonEmpty(value: string | undefined, message: string) {
  if (!value || value.trim().length === 0) {
    throw new Error(message);
  }
}

/**
 * Server action to fetch module detail data with RLS enforcement.
 * Returns a typed result with explicit error codes for proper handling.
 *
 * Error codes:
 * - UNAUTHORIZED: User is not authenticated
 * - NOT_FOUND: Module does not exist or user doesn't have access
 * - INTERNAL_ERROR: Unexpected error during fetch
 */
export async function getModuleForPage(
  moduleId: string
): Promise<ModuleAccessResult> {
  const result = await requestBoundary.action(async ({ actor, db }) => {
    const moduleData = await getModuleDetail(moduleId, actor.id, db);
    if (!moduleData) {
      logger.debug(
        { moduleId, userId: actor.id },
        'Module not found or user does not have access'
      );
      return moduleError(
        'NOT_FOUND',
        'This module does not exist or you do not have access to it.'
      );
    }
    return moduleSuccess(moduleData);
  });

  if (!result) {
    logger.debug({ moduleId }, 'Module access denied: user not authenticated');
    return moduleError(
      'UNAUTHORIZED',
      'You must be signed in to view this module.'
    );
  }
  return result;
}

interface BatchUpdateModuleTaskProgressInput {
  planId: string;
  moduleId: string;
  updates: Array<{ taskId: string; status: ProgressStatus }>;
}

const MAX_BATCH_SIZE = 500;

/**
 * Server action to batch update multiple task progress records from the module detail page.
 * Validates all updates, persists in a single transaction, and revalidates affected paths.
 */
export async function batchUpdateModuleTaskProgressAction({
  planId,
  moduleId,
  updates,
}: BatchUpdateModuleTaskProgressInput): Promise<void> {
  assertNonEmpty(planId, 'A plan id is required to update progress.');
  assertNonEmpty(moduleId, 'A module id is required to update progress.');
  if (updates.length === 0) return;
  if (updates.length > MAX_BATCH_SIZE) {
    throw new Error(
      `Batch update limit exceeded: received ${updates.length} updates, but the maximum allowed is ${MAX_BATCH_SIZE}.`
    );
  }

  for (const [index, update] of updates.entries()) {
    const taskId = update.taskId.trim();
    assertNonEmpty(
      update.taskId,
      `A task id is required to update progress for update ${index} (taskId="${taskId || '<empty>'}", status="${update.status}").`
    );
    if (!PROGRESS_STATUSES.includes(update.status)) {
      throw new Error(
        `Invalid progress status for update ${index} (taskId="${taskId}", status="${update.status}").`
      );
    }
  }

  const result = await requestBoundary.action(async ({ actor, db }) => {
    try {
      await ensureBatchModuleTaskOwnership(
        db,
        planId,
        moduleId,
        updates.map((u) => u.taskId),
        actor.id
      );
      await setTaskProgressBatch(actor.id, updates, db);
      revalidatePath(`/plans/${planId}/modules/${moduleId}`);
      revalidatePath(`/plans/${planId}`);
      revalidatePath('/plans');
    } catch (error) {
      logger.error(
        {
          planId,
          moduleId,
          userId: actor.id,
          updateCount: updates.length,
          err: error,
        },
        'Failed to batch update module task progress'
      );
      throw new Error('Unable to update task progress right now.');
    }
  });

  if (result === null) {
    throw new Error('You must be signed in to update progress.');
  }
}
