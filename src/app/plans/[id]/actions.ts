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

import { getEffectiveClerkUserId } from '@/lib/api/auth';
import { createRequestContext, withRequestContext } from '@/lib/api/context';
import { getDb } from '@/lib/db/runtime';
import { getPlanSchedule } from '@/lib/api/schedule';
import { getLearningPlanDetail } from '@/lib/db/queries/plans';
import { setTaskProgress } from '@/lib/db/queries/tasks';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { learningPlans, modules, tasks } from '@/lib/db/schema';
import type { ProgressStatus } from '@/lib/types/db';
import { PROGRESS_STATUSES } from '@/lib/types/db';
import type { LearningPlanDetail } from '@/lib/types/db';
import type { ScheduleJson } from '@/lib/scheduling/types';

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

  const db = getDb();
  const ctx = createRequestContext(
    new Request('http://localhost/server-action/update-task-progress'),
    clerkUserId
  );
  ctx.db = db;

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
}

/**
 * Server action to fetch plan detail data with RLS enforcement.
 * Uses getDb() which respects request context when available.
 */
export async function getPlanForPage(
  planId: string
): Promise<LearningPlanDetail | null> {
  const clerkUserId = await getEffectiveClerkUserId();
  if (!clerkUserId) {
    throw new Error('Unauthorized');
  }

  const user = await getUserByClerkId(clerkUserId);
  if (!user) {
    throw new Error('User not found');
  }

  const db = getDb();
  const ctx = createRequestContext(
    new Request('http://localhost/server-action/get-plan'),
    clerkUserId
  );
  ctx.db = db;

  return withRequestContext(ctx, () => getLearningPlanDetail(planId, user.id));
}

/**
 * Server action to fetch plan schedule with RLS enforcement.
 * Uses getDb() which respects request context when available.
 */
export async function getPlanScheduleForPage(
  planId: string
): Promise<ScheduleJson> {
  const clerkUserId = await getEffectiveClerkUserId();
  if (!clerkUserId) {
    throw new Error('Unauthorized');
  }

  const user = await getUserByClerkId(clerkUserId);
  if (!user) {
    throw new Error('User not found');
  }

  const db = getDb();
  const ctx = createRequestContext(
    new Request('http://localhost/server-action/get-schedule'),
    clerkUserId
  );
  ctx.db = db;

  return withRequestContext(ctx, () =>
    getPlanSchedule({ planId, userId: user.id })
  );
}
