'use server';

/**
 * RLS enforcement note:
 * - RLS policies exist and are tested, but request/server actions currently use
 *   the service-role Drizzle client via getDb() unless a request-scoped RLS client
 *   is injected into the request context.
 * - Until an RLS-capable Drizzle client is available and wired, request-layer code
 *   must validate ownership in queries (e.g., see ensureTaskOwnership below).
 *
 * Source of truth:
 * - src/lib/db/runtime.ts — getDb() returns the request-scoped DB when present,
 *   otherwise the service-role DB.
 * - src/lib/api/auth.ts — commentary on current non-RLS behavior in request handlers.
 */

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { withServerActionContext } from '@/lib/api/auth';
import {
  getPlanSchedule,
  ScheduleFetchError,
  SCHEDULE_FETCH_ERROR_CODE,
} from '@/lib/api/schedule';
import { getLearningPlanDetail } from '@/lib/db/queries/plans';
import { setTaskProgress } from '@/lib/db/queries/tasks';
import { getDb } from '@/lib/db/runtime';
import { learningPlans, modules, tasks } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
import type { ProgressStatus } from '@/lib/types/db';
import { PROGRESS_STATUSES } from '@/lib/types/db';
import type { PlanAccessResult, ScheduleAccessResult } from './types';
import {
  planError,
  planSuccess,
  scheduleError,
  scheduleSuccess,
} from './helpers';

interface UpdateTaskProgressInput {
  planId: string;
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

async function ensureTaskOwnership(
  planId: string,
  taskId: string,
  userId: string
) {
  const db = getDb();
  const [ownership] = await db
    .select({
      planId: learningPlans.id,
      taskId: tasks.id,
      planUserId: learningPlans.userId,
    })
    .from(tasks)
    .innerJoin(modules, eq(tasks.moduleId, modules.id))
    .innerJoin(learningPlans, eq(modules.planId, learningPlans.id))
    .where(and(eq(tasks.id, taskId), eq(learningPlans.id, planId)))
    .limit(1);

  if (!ownership || ownership.planUserId !== userId) {
    throw new Error('Task not found.');
  }
}

export async function updateTaskProgressAction({
  planId,
  taskId,
  status,
}: UpdateTaskProgressInput): Promise<UpdateTaskProgressResult> {
  assertNonEmpty(planId, 'A plan id is required to update progress.');
  assertNonEmpty(taskId, 'A task id is required to update progress.');

  if (!PROGRESS_STATUSES.includes(status)) {
    throw new Error('Invalid progress status.');
  }

  const result = await withServerActionContext(async (user) => {
    await ensureTaskOwnership(planId, taskId, user.id);
    const taskProgress = await setTaskProgress(user.id, taskId, status);
    revalidatePath(`/plans/${planId}`);
    revalidatePath('/plans');
    return { taskId: taskProgress.taskId, status: taskProgress.status };
  });

  if (!result) throw new Error('You must be signed in to update progress.');
  return result;
}

/**
 * Server action to fetch plan detail data with RLS enforcement.
 * Returns a typed result with explicit error codes for proper handling.
 *
 * Error codes:
 * - UNAUTHORIZED: User is not authenticated
 * - NOT_FOUND: Plan does not exist or user doesn't have access
 * - INTERNAL_ERROR: Unexpected error during fetch
 */
export async function getPlanForPage(
  planId: string
): Promise<PlanAccessResult> {
  const result = await withServerActionContext(async (user) => {
    const plan = await getLearningPlanDetail(planId, user.id);
    if (!plan) {
      logger.debug(
        { planId, userId: user.id },
        'Plan not found or user does not have access'
      );
      return planError(
        'NOT_FOUND',
        'This plan does not exist or you do not have access to it.'
      );
    }
    return planSuccess(plan);
  });

  if (!result) {
    logger.debug({ planId }, 'Plan access denied: user not authenticated');
    return planError(
      'UNAUTHORIZED',
      'You must be signed in to view this plan.'
    );
  }
  return result;
}

/**
 * Server action to fetch plan schedule with RLS enforcement.
 * Returns a typed result with explicit error codes for proper handling.
 *
 * Error codes:
 * - UNAUTHORIZED: User is not authenticated
 * - NOT_FOUND: Schedule does not exist for this plan
 * - INTERNAL_ERROR: Unexpected error during fetch
 */
export async function getPlanScheduleForPage(
  planId: string
): Promise<ScheduleAccessResult> {
  const result = await withServerActionContext(async (user) => {
    try {
      const schedule = await getPlanSchedule({ planId, userId: user.id });
      return scheduleSuccess(schedule);
    } catch (error) {
      if (error instanceof ScheduleFetchError) {
        if (
          error.code ===
          SCHEDULE_FETCH_ERROR_CODE.PLAN_NOT_FOUND_OR_ACCESS_DENIED
        ) {
          logger.debug({ planId }, 'Schedule not found or access denied');
          return scheduleError(
            'NOT_FOUND',
            'Schedule not found or you do not have access.'
          );
        }

        if (error.code === SCHEDULE_FETCH_ERROR_CODE.INVALID_WEEKLY_HOURS) {
          logger.warn(
            { planId, code: error.code },
            'Schedule generation blocked by invalid weekly hours'
          );
          return scheduleError('INTERNAL_ERROR', 'Failed to load schedule.');
        }
      }

      logger.error({ planId, error }, 'Failed to fetch plan schedule');
      return scheduleError('INTERNAL_ERROR', 'Failed to load schedule.');
    }
  });

  if (!result) {
    logger.debug({ planId }, 'Schedule access denied: user not authenticated');
    return scheduleError(
      'UNAUTHORIZED',
      'You must be signed in to view this schedule.'
    );
  }
  return result;
}
