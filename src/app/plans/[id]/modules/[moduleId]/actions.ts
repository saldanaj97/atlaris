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
import { withServerActionContext } from '@/lib/api/auth';
import { getModuleDetail } from '@/lib/db/queries/modules';
import { setTaskProgress, setTaskProgressBatch } from '@/lib/db/queries/tasks';
import { getDb } from '@/lib/db/runtime';
import { learningPlans, modules, tasks } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
import { PROGRESS_STATUSES } from '@/types/db';
import type { ProgressStatus } from '@/types/db.types';

interface UpdateTaskProgressInput {
  planId: string;
  moduleId: string;
  taskId: string;
  status: ProgressStatus;
}

interface UpdateTaskProgressResult {
  taskId: string;
  status: ProgressStatus;
}

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
  const result = await withServerActionContext(async (_user, rlsDb) => {
    const moduleData = await getModuleDetail(moduleId, rlsDb);
    if (!moduleData) {
      logger.debug(
        { moduleId },
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

/**
 * Server action to update task progress from the module detail page.
 * Revalidates both the module page and the parent plan page.
 */
export async function updateModuleTaskProgressAction({
  planId,
  moduleId,
  taskId,
  status,
}: UpdateTaskProgressInput): Promise<UpdateTaskProgressResult> {
  assertNonEmpty(planId, 'A plan id is required to update progress.');
  assertNonEmpty(moduleId, 'A module id is required to update progress.');
  assertNonEmpty(taskId, 'A task id is required to update progress.');

  if (!PROGRESS_STATUSES.includes(status)) {
    throw new Error('Invalid progress status.');
  }

  const result = await withServerActionContext(async (user, rlsDb) => {
    try {
      const taskProgress = await setTaskProgress(
        user.id,
        taskId,
        status,
        rlsDb
      );
      revalidatePath(`/plans/${planId}/modules/${moduleId}`);
      revalidatePath(`/plans/${planId}`);
      revalidatePath('/plans');
      return { taskId: taskProgress.taskId, status: taskProgress.status };
    } catch (error) {
      logger.error(
        {
          planId,
          moduleId,
          taskId,
          userId: user.id,
          status,
          error,
        },
        'Failed to update module task progress'
      );
      throw new Error('Unable to update task progress right now.');
    }
  });

  if (!result) throw new Error('You must be signed in to update progress.');
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

  const result = await withServerActionContext(async (user, rlsDb) => {
    try {
      await ensureBatchModuleTaskOwnership(
        rlsDb,
        planId,
        moduleId,
        updates.map((u) => u.taskId),
        user.id
      );
      await setTaskProgressBatch(user.id, updates, rlsDb);
      revalidatePath(`/plans/${planId}/modules/${moduleId}`);
      revalidatePath(`/plans/${planId}`);
      revalidatePath('/plans');
    } catch (error) {
      logger.error(
        {
          planId,
          moduleId,
          userId: user.id,
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
