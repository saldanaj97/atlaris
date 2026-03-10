'use client';

import { useMemo, useState } from 'react';
import type { JSX } from 'react';

import { TimelineModuleCard } from '@/app/plans/[id]/components/TimelineModuleCard';
import type {
  ModuleStatus,
  TimelineModule,
} from '@/app/plans/[id]/components/TimelineModuleCard';
import { getStatusesFromModules } from '@/app/plans/[id]/helpers';
import { Accordion } from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';
import { formatMinutes } from '@/lib/formatters';

import type { ClientModule } from '@/lib/types/client';
import type { ProgressStatus } from '@/lib/types/db';

interface ModuleTimelineProps {
  planId: string;
  modules: ClientModule[];
  statuses?: Record<string, ProgressStatus>;
  onStatusChange: (taskId: string, newStatus: ProgressStatus) => void;
}

function getModuleStatus(
  mod: ClientModule,
  statuses: Record<string, ProgressStatus>,
  previousModulesCompleted: boolean
): ModuleStatus {
  const tasks = mod.tasks ?? [];
  if (tasks.length === 0) return previousModulesCompleted ? 'active' : 'locked';

  const taskStatuses = tasks.map((task) => statuses[task.id] ?? 'not_started');
  const allCompleted = taskStatuses.every((status) => status === 'completed');
  const hasInProgress = taskStatuses.some((status) => status === 'in_progress');
  const hasAnyStarted = taskStatuses.some(
    (status) => status === 'in_progress' || status === 'completed'
  );

  if (allCompleted) return 'completed';
  if (hasInProgress || (previousModulesCompleted && hasAnyStarted)) {
    return 'active';
  }
  if (previousModulesCompleted) return 'active';
  return 'locked';
}

function getActiveModuleIdForStatuses(
  modules: ClientModule[],
  statuses: Record<string, ProgressStatus>
): string | null {
  let previousModulesCompleted = true;

  for (const mod of modules) {
    const status = getModuleStatus(mod, statuses, previousModulesCompleted);
    if (status === 'active') {
      return mod.id;
    }

    const tasks = mod.tasks ?? [];
    previousModulesCompleted = tasks.every(
      (task) => (statuses[task.id] ?? 'not_started') === 'completed'
    );
  }

  return null;
}

function getCompletedModuleIds(
  modules: ClientModule[],
  statuses: Record<string, ProgressStatus>
): Set<string> {
  return new Set(
    modules
      .filter((module) => {
        const tasks = module.tasks ?? [];
        return (
          tasks.length > 0 &&
          tasks.every(
            (task) => (statuses[task.id] ?? 'not_started') === 'completed'
          )
        );
      })
      .map((module) => module.id)
  );
}

export function PlanTimeline({
  planId,
  modules,
  statuses,
  onStatusChange,
}: ModuleTimelineProps): JSX.Element {
  const effectiveStatuses = useMemo(
    () => statuses ?? getStatusesFromModules(modules),
    [statuses, modules]
  );

  const timelineModules: TimelineModule[] = useMemo(() => {
    return modules.map((mod, index) => {
      const tasks = mod.tasks ?? [];
      const previousModulesCompleted = modules
        .slice(0, index)
        .every((prevMod) => {
          const prevTasks = prevMod.tasks ?? [];
          return prevTasks.every(
            (task) => effectiveStatuses[task.id] === 'completed'
          );
        });
      const completedCount = tasks.filter(
        (task) => effectiveStatuses[task.id] === 'completed'
      ).length;
      const status = getModuleStatus(
        mod,
        effectiveStatuses,
        previousModulesCompleted
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
  }, [modules, effectiveStatuses]);

  const activeModuleId = getActiveModuleIdForStatuses(
    modules,
    effectiveStatuses
  );

  const [expandedModuleIds, setExpandedModuleIds] = useState<string[]>(() => {
    return activeModuleId ? [activeModuleId] : [];
  });
  const visibleExpandedModuleIds =
    activeModuleId === null || expandedModuleIds.includes(activeModuleId)
      ? expandedModuleIds
      : [...expandedModuleIds, activeModuleId];

  const handleModuleToggle = (moduleId: string) => {
    setExpandedModuleIds((prev) =>
      prev.includes(moduleId)
        ? prev.filter((id) => id !== moduleId)
        : [...prev, moduleId]
    );
  };

  const handleTaskStatusChange = (
    taskId: string,
    nextStatus: ProgressStatus
  ) => {
    const currentStatus = effectiveStatuses[taskId] ?? 'not_started';
    const nextStatuses =
      currentStatus === nextStatus
        ? effectiveStatuses
        : {
            ...effectiveStatuses,
            [taskId]: nextStatus,
          };
    const completedModuleIds = getCompletedModuleIds(modules, nextStatuses);
    const nextActiveModuleId = getActiveModuleIdForStatuses(
      modules,
      nextStatuses
    );

    setExpandedModuleIds((prev) => {
      const prevWithoutCompleted = prev.filter(
        (moduleId) => !completedModuleIds.has(moduleId)
      );

      if (
        nextActiveModuleId === null ||
        prevWithoutCompleted.includes(nextActiveModuleId)
      ) {
        return prevWithoutCompleted;
      }

      return [...prevWithoutCompleted, nextActiveModuleId];
    });

    onStatusChange(taskId, nextStatus);
  };

  if (modules.length === 0) {
    return (
      <Card className="rounded-2xl text-center">
        <CardContent className="p-6">
          <p className="text-stone-500 dark:text-stone-400">
            No modules available yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="mt-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-bold text-stone-900 dark:text-stone-100">
          Learning Modules
        </h2>
        <span className="text-sm text-stone-500 dark:text-stone-400">
          {modules.length} module{modules.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="relative">
        <div className="from-primary/40 via-primary dark:from-primary/60 dark:via-primary absolute top-0 bottom-0 left-8 w-0.5 -translate-x-1/2 bg-linear-to-b to-stone-200 dark:to-stone-700" />

        <Accordion
          type="multiple"
          value={visibleExpandedModuleIds}
          className="space-y-4"
        >
          {timelineModules.map((mod) => {
            return (
              <TimelineModuleCard
                key={mod.id}
                planId={planId}
                module={mod}
                isOpen={visibleExpandedModuleIds.includes(mod.id)}
                statuses={effectiveStatuses}
                onModuleToggle={handleModuleToggle}
                onTaskStatusChange={handleTaskStatusChange}
              />
            );
          })}
        </Accordion>
      </div>
    </section>
  );
}
