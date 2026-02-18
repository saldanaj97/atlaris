import type {
  ModuleNavCompletionRaw,
  ModuleNavItem,
  ModuleNavRaw,
  ModuleResourceRow,
  TaskResourceWithResource,
} from '@/lib/db/queries/types/modules.types';

/**
 * Computes navigation items with lock status for each module.
 * A module is locked if any task in any previous module is not completed.
 *
 * @param allModulesRaw - Raw module rows (id, order, title) in order
 * @param tasksByModule - Map of moduleId -> task IDs
 * @param completedTaskIds - Set of completed task IDs
 * @returns ModuleNavItem array with isLocked populated
 */
export function computeModuleNavItems(
  allModulesRaw: ModuleNavRaw[],
  tasksByModule: Map<string, string[]>,
  completedTaskIds: Set<string>
): ModuleNavItem[] {
  const navItems: ModuleNavItem[] = [];
  let hasIncompleteTaskInPreviousModules = false;

  for (const moduleRow of allModulesRaw) {
    navItems.push({
      ...moduleRow,
      isLocked: hasIncompleteTaskInPreviousModules,
    });

    if (!hasIncompleteTaskInPreviousModules) {
      const moduleTaskIds = tasksByModule.get(moduleRow.id) ?? [];
      for (const taskId of moduleTaskIds) {
        if (!completedTaskIds.has(taskId)) {
          hasIncompleteTaskInPreviousModules = true;
          break;
        }
      }
    }
  }

  return navItems;
}

/**
 * Computes module navigation items from per-module completion counts.
 * A module is considered complete when either:
 * - it has zero tasks, or
 * - all tasks are completed.
 */
export function computeModuleNavItemsFromCounts(
  allModulesRaw: ModuleNavCompletionRaw[]
): ModuleNavItem[] {
  const navItems: ModuleNavItem[] = [];
  let hasIncompleteTaskInPreviousModules = false;

  for (const moduleRow of allModulesRaw) {
    navItems.push({
      id: moduleRow.id,
      order: moduleRow.order,
      title: moduleRow.title,
      isLocked: hasIncompleteTaskInPreviousModules,
    });

    if (!hasIncompleteTaskInPreviousModules) {
      const isModuleComplete =
        moduleRow.totalTaskCount === 0 ||
        moduleRow.completedTaskCount >= moduleRow.totalTaskCount;
      if (!isModuleComplete) {
        hasIncompleteTaskInPreviousModules = true;
      }
    }
  }

  return navItems;
}

/**
 * Groups resource rows by task ID into a map of taskId -> TaskResourceWithResource[].
 *
 * @param resourceRows - Rows from taskResources + resources join
 * @returns Map of taskId to resource array
 */
export function buildResourcesByTask(
  resourceRows: ModuleResourceRow[]
): Map<string, TaskResourceWithResource[]> {
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
  return resourcesByTask;
}
