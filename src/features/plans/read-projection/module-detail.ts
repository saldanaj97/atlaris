import { buildResourcesByTask } from '@/lib/db/queries/helpers/modules-helpers';
import type {
  ModuleDetailRows,
  ModuleTaskMetricRow,
} from '@/lib/db/queries/types/modules.types';
import type { ResourceType } from '@/shared/types/db.types';

import type {
  ModuleDetailModule,
  ModuleDetailNavItem,
  ModuleDetailReadModel,
  ModuleDetailResource,
  ModuleDetailTask,
} from './types';

/** Row shape consumed by sequential lock / nav derivation. */
export type ModuleNavMetricRow = Pick<
  ModuleTaskMetricRow,
  'id' | 'order' | 'title' | 'totalTaskCount' | 'completedTaskCount'
>;

/**
 * Sequential module locks: unlock next slice only after prior module complete.
 * Complete when zero tasks OR all tasks counted completed via SQL aggregates.
 */
export function buildModuleDetailNavItems(
  metrics: ModuleNavMetricRow[],
): ModuleDetailNavItem[] {
  const navItems: ModuleDetailNavItem[] = [];
  let hasIncompleteTaskInPreviousModules = false;

  for (const moduleRow of metrics) {
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

function flattenTaskResource(taskResource: {
  id: string;
  order: number;
  notes: string | null;
  resource: {
    type: ResourceType;
    title: string;
    url: string;
    durationMinutes: number | null;
  };
}): ModuleDetailResource {
  return {
    id: taskResource.id,
    order: taskResource.order,
    notes: taskResource.notes,
    type: taskResource.resource.type,
    title: taskResource.resource.title,
    url: taskResource.resource.url,
    durationMinutes: taskResource.resource.durationMinutes,
  };
}

/**
 * Assembles module-detail UI read-model from `getModuleDetailRows` output.
 *
 * Returns `null` when `moduleMetricsRows` and current `module.id` drift (defensive consistency).
 */
export function buildModuleDetailReadModel(
  rows: ModuleDetailRows,
): ModuleDetailReadModel | null {
  const allModules = buildModuleDetailNavItems(rows.moduleMetricsRows);

  const currentIndex = allModules.findIndex((m) => m.id === rows.module.id);
  if (currentIndex < 0) {
    return null;
  }

  const currentModuleNav = allModules[currentIndex];
  const previousModuleId =
    currentIndex > 0 ? allModules[currentIndex - 1].id : null;
  const nextModuleId =
    currentIndex < allModules.length - 1
      ? allModules[currentIndex + 1].id
      : null;

  const previousModulesComplete = !currentModuleNav.isLocked;

  const progressMap = new Map(
    rows.progressRows.map((row) => [row.taskId, row]),
  );
  const resourcesByTask = buildResourcesByTask(rows.resourceRows);

  const tasks: ModuleDetailTask[] = rows.taskRows.map((task) => {
    const progress = progressMap.get(task.id);
    const wired = resourcesByTask.get(task.id) ?? [];
    const resources: ModuleDetailResource[] = wired
      .toSorted((a, b) => a.order - b.order)
      .map((tr) => flattenTaskResource(tr));

    return {
      id: task.id,
      order: task.order,
      title: task.title,
      description: task.description,
      estimatedMinutes: task.estimatedMinutes ?? 0,
      status: progress?.status ?? 'not_started',
      resources,
    };
  });

  const modulePayload: ModuleDetailModule = {
    id: rows.module.id,
    order: rows.module.order,
    title: rows.module.title,
    description: rows.module.description,
    estimatedMinutes: rows.module.estimatedMinutes ?? 0,
    tasks,
  };

  return {
    module: modulePayload,
    planId: rows.plan.id,
    planTopic: rows.plan.topic,
    totalModules: allModules.length,
    previousModuleId,
    nextModuleId,
    previousModulesComplete,
    allModules,
  };
}
