'use server';

/**
 * Server actions for module detail page.
 *
 * RLS enforcement note:
 * - Uses authenticated RLS client to ensure proper tenant isolation
 * - Module ownership is validated through plan ownership
 */

import { revalidatePath } from 'next/cache';

import { withServerActionContext } from '@/lib/api/auth';
import { getModuleDetail } from '@/lib/db/queries/modules';
import { setTaskProgress } from '@/lib/db/queries/tasks';
import { logger } from '@/lib/logging/logger';
import type { ProgressStatus } from '@/lib/types/db';
import { PROGRESS_STATUSES } from '@/lib/types/db';
import {
  moduleError,
  moduleSuccess,
} from '@/app/plans/[id]/modules/[moduleId]/helpers';
import type { ModuleAccessResult } from '@/app/plans/[id]/modules/[moduleId]/types';

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
