import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { taskProgress, tasks } from '@/lib/db/schema';
import type { InferSelectModel } from 'drizzle-orm';

type DbTask = InferSelectModel<typeof tasks>;
type DbTaskProgress = InferSelectModel<typeof taskProgress>;

export async function getTasks(): Promise<DbTask[]> {
  const allTasks = await db.select().from(tasks);
  return allTasks;
}

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
