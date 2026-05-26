import type { ModuleStatus } from '@/app/(app)/plans/plans-progress-theme';
import type { ClientModule, ClientTask } from '@/shared/types/client.types';
import type { ProgressStatus } from '@/shared/types/db.types';

import { formatMinutes } from '@/features/plans/formatters';

export interface TimelineModule {
  id: string;
  order: number;
  title: string;
  description: string | null;
  status: ModuleStatus;
  duration: string;
  tasks: ClientTask[];
  completedTasks: number;
}
import {
  deriveActiveModuleId,
  deriveCompletedModuleIds,
  deriveModuleProgressState,
} from '@/features/plans/task-progress/client';

export function deriveTimelineModules(
  modules: ClientModule[],
  effectiveStatuses: Record<string, ProgressStatus>,
): TimelineModule[] {
  let previousModulesCompleted = true;

  return modules.map((mod, index) => {
    const tasks = mod.tasks;
    const completedCount = tasks.filter(
      (task) => (effectiveStatuses[task.id] ?? task.status) === 'completed',
    ).length;
    const status = deriveModuleProgressState(
      mod,
      effectiveStatuses,
      previousModulesCompleted,
    );

    previousModulesCompleted =
      previousModulesCompleted &&
      tasks.every(
        (task) => (effectiveStatuses[task.id] ?? task.status) === 'completed',
      );

    return {
      id: mod.id,
      order: index + 1,
      title: mod.title,
      description: mod.description,
      status,
      duration: formatMinutes(mod.estimatedMinutes),
      tasks,
      completedTasks: completedCount,
    };
  });
}

export function isPlanTimelineComplete(
  modules: ClientModule[],
  effectiveStatuses: Record<string, ProgressStatus>,
): boolean {
  return (
    modules.length > 0 &&
    modules.every(
      (mod) =>
        mod.tasks.length > 0 &&
        mod.tasks.every(
          (task) => (effectiveStatuses[task.id] ?? task.status) === 'completed',
        ),
    )
  );
}

export function getVisibleExpandedModuleIds(
  expandedModuleIds: string[],
  activeModuleId: string | null,
): string[] {
  return activeModuleId === null || expandedModuleIds.includes(activeModuleId)
    ? expandedModuleIds
    : [...expandedModuleIds, activeModuleId];
}

export function getNextExpandedModuleIds({
  previousExpandedModuleIds,
  modules,
  nextStatuses,
}: {
  previousExpandedModuleIds: string[];
  modules: ClientModule[];
  nextStatuses: Record<string, ProgressStatus>;
}): string[] {
  const completedModuleIds = deriveCompletedModuleIds(modules, nextStatuses);
  const nextActiveModuleId = deriveActiveModuleId(modules, nextStatuses);

  const prevWithoutCompleted = previousExpandedModuleIds.filter(
    (moduleId) => !completedModuleIds.has(moduleId),
  );

  if (
    nextActiveModuleId === null ||
    prevWithoutCompleted.includes(nextActiveModuleId)
  ) {
    return prevWithoutCompleted;
  }

  return [...prevWithoutCompleted, nextActiveModuleId];
}
