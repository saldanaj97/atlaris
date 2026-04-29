import type { SQL } from 'drizzle-orm';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type {
  DbTask,
  DbTaskProgress,
  TasksDbClient,
  TasksTransaction,
} from '@/lib/db/queries/types/tasks.types';
import { getDb } from '@/lib/db/runtime';
import { learningPlans, modules, taskProgress, tasks } from '@/lib/db/schema';
import type { ProgressStatus } from '@/shared/types/db.types';

interface TaskProgressBatchScope {
  planId?: string;
  moduleId?: string;
  now?: Date;
}

interface TaskProgressWriteOptions {
  now?: Date;
}

function ownedTaskScopeForUser(userId: string, taskScope: SQL) {
  return and(eq(learningPlans.userId, userId), taskScope);
}

function selectOwnedTaskIdsForUser(
  tx: TasksTransaction,
  userId: string,
  taskScope: SQL,
) {
  return tx
    .select({ id: tasks.id })
    .from(tasks)
    .innerJoin(modules, eq(tasks.moduleId, modules.id))
    .innerJoin(learningPlans, eq(modules.planId, learningPlans.id))
    .where(ownedTaskScopeForUser(userId, taskScope));
}

export async function getAllTasksInPlan(
  userId: string,
  planId: string,
  dbClient?: TasksDbClient,
): Promise<DbTask[]> {
  const client = dbClient ?? getDb();

  const rows = await client
    .select({ task: tasks })
    .from(tasks)
    .innerJoin(modules, eq(tasks.moduleId, modules.id))
    .innerJoin(learningPlans, eq(modules.planId, learningPlans.id))
    .where(ownedTaskScopeForUser(userId, eq(learningPlans.id, planId)));
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
async function setTaskProgress(
  userId: string,
  taskId: string,
  status: ProgressStatus,
  dbClient?: TasksDbClient,
  options: TaskProgressWriteOptions = {},
): Promise<DbTaskProgress> {
  const client = dbClient ?? getDb();

  return await client.transaction(async (tx) => {
    const [taskRow] = await selectOwnedTaskIdsForUser(
      tx,
      userId,
      eq(tasks.id, taskId),
    )
      .limit(1)
      .for('update');

    if (!taskRow) {
      throw new Error('Task not found or access denied');
    }

    const timestamp = options.now ?? sql<Date>`now()`;
    const completedAt = status === 'completed' ? timestamp : null;

    const [progress] = await tx
      .insert(taskProgress)
      .values({
        taskId,
        userId,
        status,
        completedAt,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: [taskProgress.taskId, taskProgress.userId],
        set: {
          status,
          completedAt: sql`excluded.completed_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .returning();

    if (!progress) {
      throw new Error(
        'Failed to update task progress: operation returned no rows',
      );
    }

    return progress;
  });
}

/**
 * Batch updates task progress for multiple tasks in a single transaction.
 * Validates ownership for all tasks via a single query, then bulk upserts.
 * Falls back to the single-update path only when no explicit plan/module scope is required.
 */
export async function setTaskProgressBatch(
  userId: string,
  updates: Array<{ taskId: string; status: ProgressStatus }>,
  dbClient?: TasksDbClient,
  scope: TaskProgressBatchScope = {},
): Promise<DbTaskProgress[]> {
  if (updates.length === 0) return [];
  if (
    updates.length === 1 &&
    scope.planId === undefined &&
    scope.moduleId === undefined
  ) {
    const result = await setTaskProgress(
      userId,
      updates[0].taskId,
      updates[0].status,
      dbClient,
      { now: scope.now },
    );
    return [result];
  }

  const client = dbClient ?? getDb();
  const taskIds = updates.map((u) => u.taskId);
  const scopeConditions: SQL[] = [inArray(tasks.id, taskIds)];
  if (scope.planId !== undefined) {
    scopeConditions.push(eq(learningPlans.id, scope.planId));
  }
  if (scope.moduleId !== undefined) {
    scopeConditions.push(eq(modules.id, scope.moduleId));
  }
  const duplicateIds = Array.from(
    taskIds.reduce((counts, taskId) => {
      counts.set(taskId, (counts.get(taskId) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()),
  )
    .filter(([_taskId, count]) => count > 1)
    .map(([taskId]) => taskId);

  if (duplicateIds.length > 0) {
    throw new Error(`Duplicate taskIds in updates: ${duplicateIds.join(', ')}`);
  }

  return await client.transaction(async (tx) => {
    const ownedTasks = await selectOwnedTaskIdsForUser(
      tx,
      userId,
      and(...scopeConditions) ?? inArray(tasks.id, taskIds),
    ).for('update');

    const ownedIds = new Set(ownedTasks.map((t) => t.id));
    const missingIds = taskIds.filter((id) => !ownedIds.has(id));
    if (missingIds.length > 0) {
      throw new Error('One or more tasks not found.');
    }

    const timestamp = scope.now ?? sql<Date>`now()`;
    const values = updates.map((u) => ({
      taskId: u.taskId,
      userId,
      status: u.status,
      completedAt: u.status === 'completed' ? timestamp : null,
      updatedAt: timestamp,
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
