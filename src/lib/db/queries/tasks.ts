import { and, eq, inArray, sql } from 'drizzle-orm';

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
 * @param dbClient - Optional TasksDbClient used for transactions/internal testing.
 * @returns A promise that resolves to an array of tasks.
 */
export async function getAllTasksInPlan(
  userId: string,
  planId: string,
  dbClient?: TasksDbClient
): Promise<DbTask[]> {
  const client = dbClient ?? getDb();

  const rows = await client
    .select({ task: tasks })
    .from(tasks)
    .innerJoin(modules, eq(tasks.moduleId, modules.id))
    .innerJoin(learningPlans, eq(modules.planId, learningPlans.id))
    .where(and(eq(learningPlans.userId, userId), eq(learningPlans.id, planId)));
  return rows.map((row) => row.task);
}

/**
 * Sets or updates the progress status for a specific task for a user.
 * Validates task ownership in SQL before updating.
 * If a progress record does not exist, it creates one; otherwise, it updates the existing record.
 * @param userId - The ID of the user.
 * @param taskId - The ID of the task.
 * @param status - The new progress status to set.
 * @param dbClient - Optional TasksDbClient used for transactions/internal testing.
 * @returns A promise that resolves to the task progress record.
 * @throws Error if the task is not found or access is denied
 */
export async function setTaskProgress(
  userId: string,
  taskId: string,
  status: ProgressStatus,
  dbClient?: TasksDbClient
): Promise<DbTaskProgress> {
  const client = dbClient ?? getDb();

  return await client.transaction(async (tx) => {
    const [taskRow] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(modules, eq(tasks.moduleId, modules.id))
      .innerJoin(learningPlans, eq(modules.planId, learningPlans.id))
      .where(and(eq(tasks.id, taskId), eq(learningPlans.userId, userId)))
      .limit(1)
      .for('update');

    if (!taskRow) {
      throw new Error('Task not found or access denied');
    }

    const now = new Date();
    const completedAt = status === 'completed' ? now : null;

    const [progress] = await tx
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
  });
}

/**
 * Batch updates task progress for multiple tasks in a single transaction.
 * Validates ownership for all tasks via a single query, then bulk upserts.
 * Falls back to single-update for single-item batches.
 */
export async function setTaskProgressBatch(
  userId: string,
  updates: Array<{ taskId: string; status: ProgressStatus }>,
  dbClient?: TasksDbClient
): Promise<DbTaskProgress[]> {
  if (updates.length === 0) return [];
  if (updates.length === 1) {
    const result = await setTaskProgress(
      userId,
      updates[0].taskId,
      updates[0].status,
      dbClient
    );
    return [result];
  }

  const client = dbClient ?? getDb();
  const taskIds = updates.map((u) => u.taskId);
  const duplicateIds = Array.from(
    taskIds.reduce((counts, taskId) => {
      counts.set(taskId, (counts.get(taskId) ?? 0) + 1);
      return counts;
    }, new Map<string, number>())
  )
    .filter(([_taskId, count]) => count > 1)
    .map(([taskId]) => taskId);

  if (duplicateIds.length > 0) {
    throw new Error(`Duplicate taskIds in updates: ${duplicateIds.join(', ')}`);
  }

  return await client.transaction(async (tx) => {
    const ownedTasks = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(modules, eq(tasks.moduleId, modules.id))
      .innerJoin(learningPlans, eq(modules.planId, learningPlans.id))
      .where(and(inArray(tasks.id, taskIds), eq(learningPlans.userId, userId)))
      .for('update');

    const ownedIds = new Set(ownedTasks.map((t) => t.id));
    const missingIds = taskIds.filter((id) => !ownedIds.has(id));
    if (missingIds.length > 0) {
      throw new Error('One or more tasks not found or access denied');
    }

    const now = new Date();
    const values = updates.map((u) => ({
      taskId: u.taskId,
      userId,
      status: u.status,
      completedAt: u.status === 'completed' ? now : null,
      updatedAt: now,
    }));

    const results = await tx
      .insert(taskProgress)
      .values(values)
      .onConflictDoUpdate({
        target: [taskProgress.taskId, taskProgress.userId],
        set: {
          status: sql`excluded.status`,
          completedAt: sql`excluded.completed_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .returning();

    if (results.length !== updates.length) {
      throw new Error('Batch update returned unexpected number of rows');
    }

    return results;
  });
}
