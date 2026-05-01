import { and, asc, countDistinct, eq, inArray, sql } from 'drizzle-orm';

import type { TaskResourceWithResource } from '@/lib/db/queries/types/modules.types';
import { getDb } from '@/lib/db/runtime';
import {
  modules,
  resources,
  taskProgress,
  taskResources,
  tasks,
} from '@/lib/db/schema';

type TaskRelationsClient = Pick<ReturnType<typeof getDb>, 'select'>;

type ModuleTaskMetricsRow = {
  planId: string;
  moduleId: string;
  moduleOrder: number;
  moduleTitle: string;
  totalTasks: number;
  completedTasks: number;
  totalMinutes: number;
  completedMinutes: number;
};

interface TaskIdsParams {
  taskIds: readonly string[];
  dbClient: TaskRelationsClient;
}

interface TaskProgressParams {
  taskIds: readonly string[];
  userId?: string;
  dbClient?: TaskRelationsClient;
}

interface ModuleTaskMetricsParams {
  planIds: readonly string[];
  userId: string;
  dbClient: TaskRelationsClient;
}

function deduplicateIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
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
  const ids = deduplicateIds(taskIds);
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
 * Loads task progress and resource rows together for callers that hydrate task DTOs.
 */
export async function fetchTaskRelationRows({
  taskIds,
  userId,
  dbClient = getDb(),
}: TaskProgressParams): Promise<{
  progressRows: (typeof taskProgress.$inferSelect)[];
  resourceRows: TaskResourceWithResource[];
}> {
  if (taskIds.length === 0) {
    return { progressRows: [], resourceRows: [] };
  }

  const [progressRows, resourceRows] = await Promise.all([
    fetchTaskProgressRows({ taskIds, userId, dbClient }),
    fetchTaskResourceRows({ taskIds, dbClient }),
  ]);

  return { progressRows, resourceRows };
}

/**
 * Loads per-module task/progress metrics for one or more plans.
 */
export async function fetchModuleTaskMetricsRows({
  planIds,
  userId,
  dbClient,
}: ModuleTaskMetricsParams): Promise<ModuleTaskMetricsRow[]> {
  const ids = deduplicateIds(planIds);
  if (ids.length === 0) {
    return [];
  }

  return await dbClient
    .select({
      planId: modules.planId,
      moduleId: modules.id,
      moduleOrder: modules.order,
      moduleTitle: modules.title,
      totalTasks: countDistinct(tasks.id),
      completedTasks: sql<number>`
        count(${taskProgress.id}) filter (
          where ${taskProgress.status} = 'completed'
        )::int
      `,
      totalMinutes: sql<number>`coalesce(sum(${tasks.estimatedMinutes}), 0)::int`,
      completedMinutes: sql<number>`
        coalesce(
          sum(
            case
              when ${taskProgress.status} = 'completed' then ${tasks.estimatedMinutes}
              else 0
            end
          ),
          0
        )::int
      `,
    })
    .from(modules)
    .leftJoin(tasks, eq(tasks.moduleId, modules.id))
    .leftJoin(
      taskProgress,
      and(eq(taskProgress.taskId, tasks.id), eq(taskProgress.userId, userId)),
    )
    .where(inArray(modules.planId, ids))
    .groupBy(modules.planId, modules.id, modules.order, modules.title)
    .orderBy(asc(modules.order));
}

/**
 * Loads task resources joined with canonical resources, ordered by relation order.
 */
async function fetchTaskResourceRows({
  taskIds,
  dbClient,
}: TaskIdsParams): Promise<TaskResourceWithResource[]> {
  const ids = deduplicateIds(taskIds);
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
