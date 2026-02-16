import {
  buildResourcesByTask,
  computeModuleNavItems,
} from '@/lib/db/queries/helpers/modules-helpers';
import type {
  ModuleDetail,
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
import { asc, eq, inArray } from 'drizzle-orm';

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
  dbClient: ModulesDbClient = getDb()
): Promise<ModuleDetail | null> {
  // RLS enforces ownership. If unauthorized, this query returns no rows.
  const [moduleRow] = await dbClient
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

  // Get all modules and tasks for this plan in one pass.
  const moduleTaskRows = await dbClient
    .select({
      moduleId: modules.id,
      moduleOrder: modules.order,
      moduleTitle: modules.title,
      task: tasks,
    })
    .from(modules)
    .leftJoin(tasks, eq(tasks.moduleId, modules.id))
    .where(eq(modules.planId, planId))
    .orderBy(asc(modules.order), asc(tasks.order));

  const allModulesRaw: Array<{ id: string; order: number; title: string }> = [];
  const allTasksInPlan: Array<typeof tasks.$inferSelect> = [];
  const seenModuleIds = new Set<string>();

  for (const row of moduleTaskRows) {
    if (!seenModuleIds.has(row.moduleId)) {
      seenModuleIds.add(row.moduleId);
      allModulesRaw.push({
        id: row.moduleId,
        order: row.moduleOrder,
        title: row.moduleTitle,
      });
    }

    if (row.task) {
      allTasksInPlan.push(row.task);
    }
  }

  // Get all progress rows for tasks in this plan (RLS-scoped to current user).
  const allTaskIds = allTasksInPlan.map((t) => t.id);
  const allProgressRows = await runIfIdsPresent(allTaskIds, () =>
    dbClient
      .select()
      .from(taskProgress)
      .where(inArray(taskProgress.taskId, allTaskIds))
  );

  const completedTaskIds = new Set(
    allProgressRows
      .filter((progressRow) => progressRow.status === 'completed')
      .map((progressRow) => progressRow.taskId)
  );

  // Group tasks by module
  const tasksByModule = new Map<string, string[]>();
  for (const task of allTasksInPlan) {
    const existing = tasksByModule.get(task.moduleId) ?? [];
    existing.push(task.id);
    tasksByModule.set(task.moduleId, existing);
  }

  const allModules = computeModuleNavItems(
    allModulesRaw,
    tasksByModule,
    completedTaskIds
  );

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

  // Tasks for this module are already loaded as part of the plan query.
  const taskRows = allTasksInPlan.filter((task) => task.moduleId === moduleId);

  const taskIds = taskRows.map((task) => task.id);

  // Get resources for tasks
  const resourceRows = await runIfIdsPresent(taskIds, () =>
    dbClient
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
    allProgressRows.map((progressRow) => [progressRow.taskId, progressRow])
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
}
