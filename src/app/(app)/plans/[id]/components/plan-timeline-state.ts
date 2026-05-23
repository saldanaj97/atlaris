import type { TimelineModule } from '@/app/(app)/plans/[id]/components/TimelineModuleCard';
import { formatMinutes } from '@/features/plans/formatters';
import {
  deriveActiveModuleId,
  deriveCompletedModuleIds,
  deriveModuleProgressState,
} from '@/features/plans/task-progress/client';
import type { ClientModule } from '@/shared/types/client.types';
import type { ProgressStatus } from '@/shared/types/db.types';

export function deriveTimelineModules(
  modules: ClientModule[],
  effectiveStatuses: Record<string, ProgressStatus>,
): TimelineModule[] {
  return modules.map((mod, index) => {
    const tasks = mod.tasks;
    const previousModulesCompleted = modules
      .slice(0, index)
      .every((prevMod) => {
        const prevTasks = prevMod.tasks;
        return prevTasks.every(
          (task) => (effectiveStatuses[task.id] ?? task.status) === 'completed',
        );
      });
    const completedCount = tasks.filter(
      (task) => (effectiveStatuses[task.id] ?? task.status) === 'completed',
    ).length;
    const status = deriveModuleProgressState(
      mod,
      effectiveStatuses,
      previousModulesCompleted,
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
