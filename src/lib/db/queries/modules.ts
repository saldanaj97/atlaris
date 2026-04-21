import { and, asc, countDistinct, eq } from 'drizzle-orm';
import {
  buildResourcesByTask,
  computeModuleNavItemsFromCounts,
} from '@/lib/db/queries/helpers/modules-helpers';
import {
  fetchTaskProgressRows,
  fetchTaskResourceRows,
} from '@/lib/db/queries/helpers/task-relations-helpers';
import type {
  ModuleDetail,
  ModuleNavCompletionRaw,
  ModuleWithTasks,
} from '@/lib/db/queries/types/modules.types';
import { getDb } from '@/lib/db/runtime';
import { learningPlans, modules, taskProgress, tasks } from '@/lib/db/schema';

type ModulesDbClient = ReturnType<typeof getDb>;

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
  userId: string,
  dbClient?: ModulesDbClient
): Promise<ModuleDetail | null> {
  const client = dbClient ?? getDb();

  const [moduleRow] = await client
    .select({
      module: modules,
      planId: learningPlans.id,
      planTopic: learningPlans.topic,
    })
    .from(modules)
    .innerJoin(learningPlans, eq(modules.planId, learningPlans.id))
    .where(and(eq(modules.id, moduleId), eq(learningPlans.userId, userId)))
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
        totalTaskCount: countDistinct(tasks.id),
        completedTaskCount: countDistinct(taskProgress.id),
      })
      .from(modules)
      .leftJoin(tasks, eq(tasks.moduleId, modules.id))
      .leftJoin(
        taskProgress,
        and(
          eq(taskProgress.taskId, tasks.id),
          eq(taskProgress.userId, userId),
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
    // `moduleRow` was resolved earlier, so under the normal invariant it should also
    // exist in `allModules` (which is derived from `allModulesRaw` for the same
    // `planId`). Keep this guard as a narrow defense against a race where the module
    // is deleted or otherwise disappears between the `moduleRow` lookup and the
    // `allModulesRaw` fetch; in that case `computeModuleNavItemsFromCounts` cannot
    // produce a valid position for the missing module.
    return null;
  }

  const currentModule = allModules[currentIndex];

  const previousModuleId =
    currentIndex > 0 ? allModules[currentIndex - 1].id : null;
  const nextModuleId =
    currentIndex < allModules.length - 1
      ? allModules[currentIndex + 1].id
      : null;

  // previousModulesComplete is the inverse of isLocked for the current module
  const previousModulesComplete = !currentModule.isLocked;

  const taskIds = taskRows.map((task) => task.id);

  const [progressRows, resourceRows] = await Promise.all([
    fetchTaskProgressRows({ taskIds, userId, dbClient: client }),
    fetchTaskResourceRows({ taskIds, dbClient: client }),
  ]);

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
}
