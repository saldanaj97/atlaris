'use server';

/**
 * Server actions for module detail page.
 *
 * RLS enforcement note:
 * - Uses authenticated RLS client to ensure proper tenant isolation
 * - Module ownership is validated through plan ownership
 */

import { revalidatePath } from 'next/cache';

import {
  moduleError,
  moduleSuccess,
} from '@/app/(app)/plans/[id]/modules/[moduleId]/helpers';
import type { ModuleAccessResult } from '@/app/(app)/plans/[id]/modules/[moduleId]/types';
import {
  applyTaskProgressUpdates,
  validateTaskProgressBatchInput,
} from '@/features/plans/task-progress';
import { requestBoundary } from '@/lib/api/request-boundary';
import { getModuleDetail } from '@/lib/db/queries/modules';
import { logger } from '@/lib/logging/logger';
import type { ProgressStatus } from '@/shared/types/db.types';

export async function getModuleForPage(
  moduleId: string,
): Promise<ModuleAccessResult> {
  const boundaryResult = await requestBoundary.action(async ({ actor, db }) => {
    const moduleData = await getModuleDetail(moduleId, actor.id, db);
    if (!moduleData) {
      logger.debug(
        { moduleId, userId: actor.id },
        'Module not found or user does not have access',
      );
      return moduleError(
        'NOT_FOUND',
        'This module does not exist or you do not have access to it.',
      );
    }
    return moduleSuccess(moduleData);
  });

  if (!boundaryResult) {
    logger.debug({ moduleId }, 'Module access denied: user not authenticated');
    return moduleError(
      'UNAUTHORIZED',
      'You must be signed in to view this module.',
    );
  }
  return boundaryResult;
}

interface BatchUpdateModuleTaskProgressInput {
  planId: string;
  moduleId: string;
  updates: Array<{ taskId: string; status: ProgressStatus }>;
}

/**
 * Server action to batch update multiple task progress records from the module detail page.
 * Delegates validation, scope checks, persistence, and path selection to `applyTaskProgressUpdates`.
 */
export async function batchUpdateModuleTaskProgressAction({
  planId,
  moduleId,
  updates,
}: BatchUpdateModuleTaskProgressInput): Promise<void> {
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
      for (const path of outcome.revalidatePaths) {
        revalidatePath(path);
      }
    } catch (error) {
      logger.error(
        {
          planId,
          moduleId,
          userId: actor.id,
          updateCount: updates.length,
          err: error,
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
}
