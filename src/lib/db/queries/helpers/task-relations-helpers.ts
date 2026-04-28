import { and, asc, eq, inArray } from 'drizzle-orm';

import type { TaskResourceWithResource } from '@/lib/db/queries/types/modules.types';
import { getDb } from '@/lib/db/runtime';
import { resources, taskProgress, taskResources } from '@/lib/db/schema';

type TaskRelationsClient = Pick<ReturnType<typeof getDb>, 'select'>;

interface TaskIdsParams {
  taskIds: readonly string[];
  dbClient: TaskRelationsClient;
}

interface TaskProgressParams {
  taskIds: readonly string[];
  userId?: string;
  dbClient?: TaskRelationsClient;
}

function uniqueTaskIds(taskIds: readonly string[]): string[] {
  return [...new Set(taskIds)];
}

/**
 * Loads task progress rows for the given task ids.
 * If userId is provided, rows are filtered by user in SQL.
 * dbClient defaults to getDb() so callers can omit it or inject a client for DI/testing.
 */
export async function fetchTaskProgressRows({
  taskIds,
  userId,
  dbClient = getDb(),
}: TaskProgressParams): Promise<(typeof taskProgress.$inferSelect)[]> {
  const ids = uniqueTaskIds(taskIds);
  if (ids.length === 0) {
    return [];
  }

  const whereClause =
    userId !== undefined
      ? and(eq(taskProgress.userId, userId), inArray(taskProgress.taskId, ids))
      : inArray(taskProgress.taskId, ids);

  return await dbClient.select().from(taskProgress).where(whereClause);
}

/**
 * Loads task resources joined with canonical resources, ordered by relation order.
 */
export async function fetchTaskResourceRows({
  taskIds,
  dbClient,
}: TaskIdsParams): Promise<TaskResourceWithResource[]> {
  const ids = uniqueTaskIds(taskIds);
  if (ids.length === 0) {
    return [];
  }

  return dbClient
    .select({
      id: taskResources.id,
      taskId: taskResources.taskId,
      resourceId: taskResources.resourceId,
      order: taskResources.order,
      notes: taskResources.notes,
      createdAt: taskResources.createdAt,
      resource: {
        id: resources.id,
        type: resources.type,
        title: resources.title,
        url: resources.url,
        domain: resources.domain,
        author: resources.author,
        durationMinutes: resources.durationMinutes,
        costCents: resources.costCents,
        currency: resources.currency,
        tags: resources.tags,
        createdAt: resources.createdAt,
      },
    })
    .from(taskResources)
    .innerJoin(resources, eq(taskResources.resourceId, resources.id))
    .where(inArray(taskResources.taskId, ids))
    .orderBy(asc(taskResources.order));
}
