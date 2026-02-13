import { and, eq } from 'drizzle-orm';

import { getDb } from '@/lib/db/runtime';
import { learningPlans, modules, taskProgress, tasks } from '@/lib/db/schema';
import type { ProgressStatus } from '@/lib/types/db';
import { sanitizePlainText } from '@/lib/utils/sanitize';
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
  planId: string,
  dbClient: ReturnType<typeof getDb> = getDb()
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
 * Retrieves all tasks in a specific learning plan by planId
 * @param planId - The ID of the learning plan
 * @returns A promise that resolves to an array of tasks with module info
 */
export async function getTasksByPlanId(planId: string): Promise<
  Array<{
    task: DbTask;
    moduleTitle: string;
  }>
> {
  const db = getDb();
  const rows = await db
    .select({
      task: tasks,
      moduleTitle: modules.title,
    })
    .from(tasks)
    .innerJoin(modules, eq(tasks.moduleId, modules.id))
    .where(eq(modules.planId, planId))
    .orderBy(tasks.order);
  return rows;
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
  const db = getDb();
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
  const db = getDb();
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
  const db = getDb();
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

/**
 * Update task description by appending new content
 * Sanitizes all inputs to prevent XSS attacks and ensure safe plain text storage.
 * @param taskId - The ID of the task
 * @param additionalDescription - Additional description text to append
 * @returns Promise that resolves when update completes
 */
export async function appendTaskDescription(
  taskId: string,
  additionalDescription: string
): Promise<void> {
  const db = getDb();
  // Get current task
  const [currentTask] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!currentTask) {
    throw new Error(`Task not found: ${taskId}`);
  }

  // Sanitize both existing description and new content before appending
  const sanitizedExisting = currentTask.description
    ? sanitizePlainText(currentTask.description)
    : '';
  const sanitizedAdditional = sanitizePlainText(additionalDescription);

  // If there's nothing meaningful to append, keep the original description unchanged
  if (!sanitizedAdditional) {
    return;
  }

  // Append to existing description (or create new if none exists)
  const newDescription = sanitizedExisting
    ? `${sanitizedExisting}\n\n${sanitizedAdditional}`
    : sanitizedAdditional;

  await db
    .update(tasks)
    .set({
      description: newDescription,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));
}

/**
 * Append a micro-explanation to a task description.
 * Uses a flag to prevent duplicate micro-explanations from being added.
 * Sanitizes all inputs to prevent XSS attacks.
 * @param taskId - The ID of the task
 * @param microExplanation - The micro-explanation text to append
 * @returns Promise that resolves when update completes, or immediately if already has micro-explanation
 */
export async function appendTaskMicroExplanation(
  taskId: string,
  microExplanation: string
): Promise<string> {
  const db = getDb();
  // Get current task
  const [currentTask] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!currentTask) {
    throw new Error(`Task not found: ${taskId}`);
  }

  // If micro-explanation already exists, skip
  if (currentTask.hasMicroExplanation) {
    // Return the current DB value (may be null if empty)
    return currentTask.description ?? '';
  }

  // Sanitize the micro-explanation text
  const sanitizedExplanation = sanitizePlainText(microExplanation);

  // Sanitize existing description if present
  const sanitizedExisting = currentTask.description
    ? sanitizePlainText(currentTask.description)
    : '';

  // Append with a plain-text prefix (no HTML markers)
  const prefix = '\n\nMicro-explanation\n';
  const newDescription = sanitizedExisting
    ? `${sanitizedExisting}${prefix}${sanitizedExplanation}`
    : `${prefix}${sanitizedExplanation}`;

  await db
    .update(tasks)
    .set({
      description: newDescription,
      hasMicroExplanation: true,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  return newDescription;
}
