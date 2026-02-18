import { cleanupDbClient } from '@/lib/db/queries/helpers/db-client-lifecycle';
import {
  buildResourcesByTask,
  computeModuleNavItemsFromCounts,
} from '@/lib/db/queries/helpers/modules-helpers';
import type {
  ModuleDetail,
  ModuleNavCompletionRaw,
  ModuleWithTasks,
} from '@/lib/db/queries/types/modules.types';
import { getDb } from '@/lib/db/runtime';
import {
  learningPlans,
  modules,
  resources,
  taskProgress,
  taskResources,
  tasks,
} from '@/lib/db/schema';
import { and, asc, count, eq, inArray } from 'drizzle-orm';

type ModulesDbClient = ReturnType<typeof getDb>;

async function runIfIdsPresent<T>(
  ids: readonly string[],
  runQuery: () => Promise<T[]>
): Promise<T[]> {
  return ids.length > 0 ? runQuery() : [];
}

/**
 * Module queries: full module detail with plan context, resources, and progress.
 * Uses getDb() for request-scoped RLS.
 */

/**
 * Retrieves detailed module data including tasks, resources, and progress.
 * Also includes plan context for breadcrumb navigation.
 *
 * @param moduleId - The ID of the module to fetch
 * @returns Module detail with plan context, or null if not found/unauthorized
 */
export async function getModuleDetail(
  moduleId: string,
  dbClient?: ModulesDbClient
): Promise<ModuleDetail | null> {
  const client = dbClient ?? getDb();

  try {
    // RLS enforces ownership. If unauthorized, this query returns no rows.
    const [moduleRow] = await client
      .select({
        module: modules,
        planId: learningPlans.id,
        planTopic: learningPlans.topic,
      })
      .from(modules)
      .innerJoin(learningPlans, eq(modules.planId, learningPlans.id))
      .where(eq(modules.id, moduleId))
      .limit(1);

    if (!moduleRow) {
      return null;
    }

    const planId = moduleRow.planId;

    const [allModulesRaw, taskRows] = await Promise.all([
      client
        .select({
          id: modules.id,
          order: modules.order,
          title: modules.title,
          totalTaskCount: count(tasks.id),
          completedTaskCount: count(taskProgress.id),
        })
        .from(modules)
        .leftJoin(tasks, eq(tasks.moduleId, modules.id))
        .leftJoin(
          taskProgress,
          and(
            eq(taskProgress.taskId, tasks.id),
            eq(taskProgress.status, 'completed')
          )
        )
        .where(eq(modules.planId, planId))
        .groupBy(modules.id, modules.order, modules.title)
        .orderBy(asc(modules.order)),
      client
        .select()
        .from(tasks)
        .where(eq(tasks.moduleId, moduleId))
        .orderBy(asc(tasks.order)),
    ]);

    const normalizedModuleRows: ModuleNavCompletionRaw[] = allModulesRaw.map(
      (row) => ({
        id: row.id,
        order: row.order,
        title: row.title,
        totalTaskCount: Number(row.totalTaskCount),
        completedTaskCount: Number(row.completedTaskCount),
      })
    );

    const allModules = computeModuleNavItemsFromCounts(normalizedModuleRows);

    const currentIndex = allModules.findIndex((m) => m.id === moduleId);
    if (currentIndex < 0) {
      return null;
    }

    const previousModuleId =
      currentIndex > 0 ? allModules[currentIndex - 1].id : null;
    const nextModuleId =
      currentIndex < allModules.length - 1
        ? allModules[currentIndex + 1].id
        : null;

    // previousModulesComplete is the inverse of isLocked for the current module
    const previousModulesComplete = !allModules[currentIndex].isLocked;

    const taskIds = taskRows.map((task) => task.id);

    const progressRows = await runIfIdsPresent(taskIds, () =>
      client
        .select()
        .from(taskProgress)
        .where(inArray(taskProgress.taskId, taskIds))
    );

    // Get resources for tasks
    const resourceRows = await runIfIdsPresent(taskIds, () =>
      client
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
        .where(inArray(taskResources.taskId, taskIds))
        .orderBy(asc(taskResources.order))
    );

    const progressMap = new Map(
      progressRows.map((progressRow) => [progressRow.taskId, progressRow])
    );
    const resourcesByTask = buildResourcesByTask(resourceRows);

    const moduleWithTasks: ModuleWithTasks = {
      ...moduleRow.module,
      tasks: taskRows.map((task) => ({
        ...task,
        resources: resourcesByTask.get(task.id) ?? [],
        progress: progressMap.get(task.id) ?? null,
      })),
    };

    return {
      module: moduleWithTasks,
      planId,
      planTopic: moduleRow.planTopic,
      totalModules: allModules.length,
      previousModuleId,
      nextModuleId,
      previousModulesComplete,
      allModules,
    };
  } finally {
    if (dbClient === undefined) {
      await cleanupDbClient(client);
    }
  }
}
