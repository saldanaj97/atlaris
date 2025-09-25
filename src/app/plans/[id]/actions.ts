'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { getEffectiveClerkUserId } from '@/lib/api/auth';
import { db } from '@/lib/db/drizzle';
import {
  getLearningPlanDetail,
  getUserByClerkId,
  setTaskProgress,
} from '@/lib/db/queries';
import { learningPlans, modules, tasks } from '@/lib/db/schema';
import type { ProgressStatus, TaskProgress } from '@/lib/types/db';
import { PROGRESS_STATUSES } from '@/lib/types/db';

interface UpdateTaskProgressInput {
  planId: string;
  taskId: string;
  status: ProgressStatus;
}

interface UpdateTaskProgressResult {
  taskProgress: TaskProgress;
  totals?: { totalTasks: number; completedTasks: number };
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

  await ensureTaskOwnership(planId, taskId, user.id);

  const taskProgress = await setTaskProgress(user.id, taskId, status);
  const detail = await getLearningPlanDetail(planId, user.id);

  revalidatePath(`/plans/${planId}`);
  revalidatePath('/plans');

  return {
    taskProgress,
    totals: detail
      ? {
          totalTasks: detail.totalTasks,
          completedTasks: detail.completedTasks,
        }
      : undefined,
  };
}
