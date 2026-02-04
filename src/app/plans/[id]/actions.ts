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

import {
  getAuthenticatedRlsIdentity,
  getEffectiveClerkUserId,
} from '@/lib/api/auth';
import { createRequestContext, withRequestContext } from '@/lib/api/context';
import { JwtValidationError } from '@/lib/api/errors';
import { getPlanSchedule } from '@/lib/api/schedule';
import { createAuthenticatedRlsClient } from '@/lib/db/rls';
import { getLearningPlanDetail } from '@/lib/db/queries/plans';
import { setTaskProgress } from '@/lib/db/queries/tasks';
import { getUserByClerkId } from '@/lib/db/queries/users';
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

  const clerkUserId = await getEffectiveClerkUserId();
  if (!clerkUserId) {
    throw new Error('You must be signed in to update progress.');
  }

  const user = await getUserByClerkId(clerkUserId);
  if (!user) {
    throw new Error('User not found.');
  }

  const identity = await getAuthenticatedRlsIdentity(clerkUserId);
  const { db: rlsDb, cleanup } = await createAuthenticatedRlsClient(identity);
  const ctx = createRequestContext(
    new Request('http://localhost/server-action/update-task-progress'),
    clerkUserId,
    rlsDb,
    cleanup
  );

  try {
    await withRequestContext(ctx, async () => {
      await ensureTaskOwnership(planId, taskId, user.id);
    });

    const taskProgress = await withRequestContext(ctx, async () =>
      setTaskProgress(user.id, taskId, status)
    );

    revalidatePath(`/plans/${planId}`);
    revalidatePath('/plans');

    // API route removed; surface the minimal payload expected by clients.
    return {
      taskId: taskProgress.taskId,
      status: taskProgress.status,
    };
  } finally {
    await cleanup();
  }
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
  const clerkUserId = await getEffectiveClerkUserId();
  if (!clerkUserId) {
    logger.debug({ planId }, 'Plan access denied: user not authenticated');
    return planError(
      'UNAUTHORIZED',
      'You must be signed in to view this plan.'
    );
  }

  const user = await getUserByClerkId(clerkUserId);
  if (!user) {
    logger.warn(
      { planId, clerkUserId },
      'Plan access denied: authenticated user not found in database'
    );
    return planError(
      'UNAUTHORIZED',
      'Your account could not be found. Please sign in again.'
    );
  }

  let rlsDb: Awaited<ReturnType<typeof createAuthenticatedRlsClient>>['db'];
  let cleanup: () => Promise<void>;
  try {
    const identity = await getAuthenticatedRlsIdentity(clerkUserId);
    const result = await createAuthenticatedRlsClient(identity);
    rlsDb = result.db;
    cleanup = result.cleanup;
  } catch (error) {
    if (error instanceof JwtValidationError) {
      logger.warn(
        { planId, clerkUserId, error },
        'Plan access denied: invalid JWT'
      );
      return planError(
        'UNAUTHORIZED',
        'Your session is no longer valid. Please sign in again.'
      );
    }
    throw error;
  }
  const ctx = createRequestContext(
    new Request('http://localhost/server-action/get-plan'),
    clerkUserId,
    rlsDb,
    cleanup
  );

  try {
    const plan = await withRequestContext(ctx, () =>
      getLearningPlanDetail(planId, user.id)
    );

    if (!plan) {
      // Plan not found could mean:
      // 1. Plan doesn't exist at all
      // 2. Plan exists but user doesn't own it (RLS filtered)
      // We return NOT_FOUND to avoid leaking information about plan existence
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
  } catch (error) {
    logger.error({ planId, userId: user.id, error }, 'Failed to fetch plan');
    return planError('INTERNAL_ERROR', 'An unexpected error occurred.');
  } finally {
    await cleanup();
  }
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
  const clerkUserId = await getEffectiveClerkUserId();
  if (!clerkUserId) {
    logger.debug({ planId }, 'Schedule access denied: user not authenticated');
    return scheduleError(
      'UNAUTHORIZED',
      'You must be signed in to view this schedule.'
    );
  }

  const user = await getUserByClerkId(clerkUserId);
  if (!user) {
    logger.warn(
      { planId, clerkUserId },
      'Schedule access denied: authenticated user not found in database'
    );
    return scheduleError(
      'UNAUTHORIZED',
      'Your account could not be found. Please sign in again.'
    );
  }

  let rlsDb: Awaited<ReturnType<typeof createAuthenticatedRlsClient>>['db'];
  let cleanup: () => Promise<void>;
  try {
    const identity = await getAuthenticatedRlsIdentity(clerkUserId);
    const result = await createAuthenticatedRlsClient(identity);
    rlsDb = result.db;
    cleanup = result.cleanup;
  } catch (error) {
    if (error instanceof JwtValidationError) {
      logger.warn(
        { planId, clerkUserId, error },
        'Schedule access denied: invalid JWT'
      );
      return scheduleError(
        'UNAUTHORIZED',
        'Your session is no longer valid. Please sign in again.'
      );
    }
    throw error;
  }
  const ctx = createRequestContext(
    new Request('http://localhost/server-action/get-schedule'),
    clerkUserId,
    rlsDb,
    cleanup
  );

  try {
    const schedule = await withRequestContext(ctx, () =>
      getPlanSchedule({ planId, userId: user.id })
    );
    return scheduleSuccess(schedule);
  } catch (error) {
    // Discriminate errors to return appropriate error codes
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (
        message.includes('not found') ||
        message.includes('access denied') ||
        message.includes('does not exist')
      ) {
        logger.debug(
          { planId, userId: user.id },
          'Schedule not found or access denied'
        );
        return scheduleError(
          'NOT_FOUND',
          'Schedule not found or you do not have access.'
        );
      }
    }
    logger.error(
      { planId, userId: user.id, error },
      'Failed to fetch plan schedule'
    );
    return scheduleError('INTERNAL_ERROR', 'Failed to load schedule.');
  } finally {
    await cleanup();
  }
}
