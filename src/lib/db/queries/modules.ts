import { and, asc, eq, inArray } from 'drizzle-orm';

import { getDb } from '@/lib/db/runtime';
import {
  learningPlans,
  modules,
  resources,
  taskProgress,
  taskResources,
  tasks,
} from '@/lib/db/schema';
import type {
  Module,
  ModuleWithTasks,
  Task,
  TaskResourceWithResource,
} from '@/lib/types/db';

export async function getModuleWithTasks(
  moduleId: string
): Promise<Array<{ modules: Module | null; tasks: Task | null }>> {
  const db = getDb();
  return await db
    .select()
    .from(modules)
    .leftJoin(tasks, eq(tasks.moduleId, modules.id))
    .where(eq(modules.id, moduleId));
}

/**
 * Minimal module info for navigation dropdown
 */
export interface ModuleNavItem {
  id: string;
  order: number;
  title: string;
  /** Whether this module is locked (previous modules not completed) */
  isLocked: boolean;
}

/**
 * Module detail type including plan context for navigation
 */
export interface ModuleDetail {
  module: ModuleWithTasks;
  planId: string;
  planTopic: string;
  totalModules: number;
  previousModuleId: string | null;
  nextModuleId: string | null;
  /** Whether all previous modules have been fully completed */
  previousModulesComplete: boolean;
  /** All modules in the plan for navigation dropdown */
  allModules: ModuleNavItem[];
}

/**
 * Retrieves detailed module data including tasks, resources, and progress.
 * Also includes plan context for breadcrumb navigation.
 *
 * @param moduleId - The ID of the module to fetch
 * @param userId - The ID of the user (for progress data)
 * @returns Module detail with plan context, or null if not found/unauthorized
 */
export async function getModuleDetail(
  moduleId: string,
  userId: string
): Promise<ModuleDetail | null> {
  const db = getDb();

  // First, get the module and verify ownership through the plan
  const [moduleRow] = await db
    .select({
      module: modules,
      planId: learningPlans.id,
      planTopic: learningPlans.topic,
      planUserId: learningPlans.userId,
    })
    .from(modules)
    .innerJoin(learningPlans, eq(modules.planId, learningPlans.id))
    .where(eq(modules.id, moduleId))
    .limit(1);

  if (!moduleRow) {
    return null;
  }

  // Verify user owns this plan
  if (moduleRow.planUserId !== userId) {
    return null;
  }

  const planId = moduleRow.planId;

  // Get all modules for this plan to determine navigation
  const allModulesRaw = await db
    .select({ id: modules.id, order: modules.order, title: modules.title })
    .from(modules)
    .where(eq(modules.planId, planId))
    .orderBy(asc(modules.order));

  // Get all tasks for all modules to compute lock status
  const allModuleIds = allModulesRaw.map((m) => m.id);
  const allTasksInPlan = allModuleIds.length
    ? await db
        .select({ id: tasks.id, moduleId: tasks.moduleId })
        .from(tasks)
        .where(inArray(tasks.moduleId, allModuleIds))
    : [];

  // Get completion status for all tasks
  const allTaskIds = allTasksInPlan.map((t) => t.id);
  const allCompletedTasks = allTaskIds.length
    ? await db
        .select({ taskId: taskProgress.taskId })
        .from(taskProgress)
        .where(
          and(
            eq(taskProgress.userId, userId),
            inArray(taskProgress.taskId, allTaskIds),
            eq(taskProgress.status, 'completed')
          )
        )
    : [];

  const completedTaskIds = new Set(allCompletedTasks.map((t) => t.taskId));

  // Group tasks by module
  const tasksByModule = new Map<string, string[]>();
  for (const task of allTasksInPlan) {
    const existing = tasksByModule.get(task.moduleId) ?? [];
    existing.push(task.id);
    tasksByModule.set(task.moduleId, existing);
  }

  // Compute isLocked for each module
  // A module is locked if any task in any previous module is not completed
  const allModules: ModuleNavItem[] = allModulesRaw.map((m, index) => {
    if (index === 0) {
      // First module is never locked
      return { ...m, isLocked: false };
    }

    // Check if all tasks in previous modules are completed
    const previousModules = allModulesRaw.slice(0, index);
    for (const prevModule of previousModules) {
      const prevModuleTasks = tasksByModule.get(prevModule.id) ?? [];
      for (const taskId of prevModuleTasks) {
        if (!completedTaskIds.has(taskId)) {
          return { ...m, isLocked: true };
        }
      }
    }

    return { ...m, isLocked: false };
  });

  const currentIndex = allModules.findIndex((m) => m.id === moduleId);
  const previousModuleId =
    currentIndex > 0 ? allModules[currentIndex - 1].id : null;
  const nextModuleId =
    currentIndex < allModules.length - 1
      ? allModules[currentIndex + 1].id
      : null;

  // previousModulesComplete is the inverse of isLocked for the current module
  const previousModulesComplete = !allModules[currentIndex].isLocked;

  // Get tasks for this module
  const taskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.moduleId, moduleId))
    .orderBy(asc(tasks.order));

  const taskIds = taskRows.map((task) => task.id);

  // Get progress for tasks
  const progressRows = taskIds.length
    ? await db
        .select()
        .from(taskProgress)
        .where(
          and(
            eq(taskProgress.userId, userId),
            inArray(taskProgress.taskId, taskIds)
          )
        )
    : [];

  // Get resources for tasks
  const resourceRows = taskIds.length
    ? await db
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
    : [];

  // Map progress by task ID
  const progressMap = new Map(progressRows.map((p) => [p.taskId, p]));

  // Map resources by task ID
  const resourcesByTask = new Map<string, TaskResourceWithResource[]>();
  for (const row of resourceRows) {
    const existing = resourcesByTask.get(row.taskId) ?? [];
    existing.push({
      id: row.id,
      taskId: row.taskId,
      resourceId: row.resourceId,
      order: row.order,
      notes: row.notes,
      createdAt: row.createdAt,
      resource: row.resource,
    });
    resourcesByTask.set(row.taskId, existing);
  }

  // Build the module with tasks
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
