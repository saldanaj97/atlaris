import { and, eq } from 'drizzle-orm';

import type {
  DbTask,
  DbTaskProgress,
  TasksDbClient,
} from '@/lib/db/queries/types/tasks.types';
import { getDb } from '@/lib/db/runtime';
import { learningPlans, modules, taskProgress, tasks } from '@/lib/db/schema';
import type { ProgressStatus } from '@/lib/types/db';

/**
 * Retrieves all tasks in a specific learning plan for a user.
 * @param userId - The ID of the user.
 * @param planId - The ID of the learning plan.
 * @returns A promise that resolves to an array of tasks.
 */
export async function getAllTasksInPlan(
  userId: string,
  planId: string,
  dbClient: TasksDbClient = getDb()
): Promise<DbTask[]> {
  const rows = await dbClient
    .select({ task: tasks })
    .from(tasks)
    .innerJoin(modules, eq(tasks.moduleId, modules.id))
    .innerJoin(learningPlans, eq(modules.planId, learningPlans.id))
    .where(and(eq(learningPlans.userId, userId), eq(learningPlans.id, planId)));
  return rows.map((row) => row.task);
}

/**
 * Sets or updates the progress status for a specific task for a user.
 * Validates that the task belongs to a plan owned by the user before updating.
 * If a progress record does not exist, it creates one; otherwise, it updates the existing record.
 * @param userId - The ID of the user.
 * @param taskId - The ID of the task.
 * @param status - The new progress status to set.
 * @param dbClient - Optional database client (defaults to getDb())
 * @returns A promise that resolves to the task progress record.
 * @throws Error if the task is not found or the user doesn't own the task's plan
 */
export async function setTaskProgress(
  userId: string,
  taskId: string,
  status: ProgressStatus,
  dbClient: TasksDbClient = getDb()
): Promise<DbTaskProgress> {
  // Validate task ownership first
  const [ownership] = await dbClient
    .select({
      taskId: tasks.id,
      planUserId: learningPlans.userId,
    })
    .from(tasks)
    .innerJoin(modules, eq(tasks.moduleId, modules.id))
    .innerJoin(learningPlans, eq(modules.planId, learningPlans.id))
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!ownership || ownership.planUserId !== userId) {
    throw new Error('Task not found or access denied');
  }

  const now = new Date();
  const completedAt = status === 'completed' ? now : null;

  const [progress] = await dbClient
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

  if (!progress) {
    throw new Error(
      'Failed to update task progress: operation returned no rows'
    );
  }

  return progress;
}
