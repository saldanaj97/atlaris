import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { learningPlans, modules, taskProgress, tasks } from '@/lib/db/schema';
import type { ProgressStatus } from '@/lib/types/db';
import type { InferSelectModel } from 'drizzle-orm';

type DbTask = InferSelectModel<typeof tasks>;
type DbTaskProgress = InferSelectModel<typeof taskProgress>;

/**
 * Retrieves all tasks in a specific learning plan for a user.
 * @param userId - The ID of the user.
 * @param planId - The ID of the learning plan.
 * @returns A promise that resolves to an array of tasks.
 */
export async function getAllTasksInPlan(
  userId: string,
  planId: string
): Promise<DbTask[]> {
  const rows = await db
    .select({ task: tasks })
    .from(tasks)
    .innerJoin(modules, eq(tasks.moduleId, modules.id))
    .innerJoin(learningPlans, eq(modules.planId, learningPlans.id))
    .where(and(eq(learningPlans.userId, userId), eq(learningPlans.id, planId)));
  return rows.map((row) => row.task);
}

/**
 * Retrieves the task progress for a specific user and task.
 * @param userId - The ID of the user.
 * @param taskId - The ID of the task.
 * @returns A promise that resolves to the task progress record or undefined if not found.
 */
export async function getUserTaskProgress(
  userId: string,
  taskId: string
): Promise<DbTaskProgress | undefined> {
  const result = await db
    .select()
    .from(taskProgress)
    .where(
      and(eq(taskProgress.userId, userId), eq(taskProgress.taskId, taskId))
    );
  return result[0];
}

/**
 * Retrieves the task progress for a specific user and plan.
 * @param userId - The ID of the user.
 * @param planId - The ID of the learning plan.
 * @returns A promise that resolves to an array of task progress records.
 */
export async function getTaskProgressForUserPlan(
  userId: string,
  planId: string
): Promise<DbTaskProgress[]> {
  const rows = await db
    .select({ progress: taskProgress })
    .from(taskProgress)
    .innerJoin(tasks, eq(taskProgress.taskId, tasks.id))
    .innerJoin(modules, eq(tasks.moduleId, modules.id))
    .where(and(eq(taskProgress.userId, userId), eq(modules.planId, planId)));

  return rows.map((row) => row.progress);
}

/**
 * Sets or updates the progress status for a specific task for a user.
 * If a progress record does not exist, it creates one; otherwise, it updates the existing record.
 * @param userId - The ID of the user.
 * @param taskId - The ID of the task.
 * @param status - The new progress status to set.
 * @returns A promise that resolves to the task progress record.
 */
export async function setTaskProgress(
  userId: string,
  taskId: string,
  status: ProgressStatus
): Promise<DbTaskProgress> {
  const now = new Date();
  const completedAt = status === 'completed' ? now : null;

  const [progress] = await db
    .insert(taskProgress)
    .values({
      taskId,
      userId,
      status,
      completedAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [taskProgress.taskId, taskProgress.userId],
      set: {
        status,
        completedAt,
        updatedAt: now,
      },
    })
    .returning();

  return progress;
}
