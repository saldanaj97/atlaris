'use client';

import type { TimelineModule } from '@/app/(app)/plans/[id]/components/TimelineModuleCard';
import { TimelineModuleCard } from '@/app/(app)/plans/[id]/components/TimelineModuleCard';
import { getStatusesFromModules } from '@/app/(app)/plans/[id]/helpers';
import { Accordion } from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';
import { formatMinutes } from '@/features/plans/formatters';
import {
  deriveActiveModuleId,
  deriveCompletedModuleIds,
  deriveModuleProgressState,
} from '@/features/plans/task-progress/client';
import { CheckCircle2, Flag } from 'lucide-react';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';

import type { ClientModule } from '@/shared/types/client.types';
import type { ProgressStatus } from '@/shared/types/db.types';
import { cn } from '@/lib/utils';

interface ModuleTimelineProps {
  planId: string;
  modules: ClientModule[];
  statuses?: Record<string, ProgressStatus>;
  onStatusChange: (taskId: string, newStatus: ProgressStatus) => void;
}

export function PlanTimeline({
  planId,
  modules,
  statuses,
  onStatusChange,
}: ModuleTimelineProps): JSX.Element {
  const effectiveStatuses = useMemo(
    () => statuses ?? getStatusesFromModules(modules),
    [statuses, modules],
  );

  const timelineModules: TimelineModule[] = useMemo(() => {
    return modules.map((mod, index) => {
      const tasks = mod.tasks;
      const previousModulesCompleted = modules
        .slice(0, index)
        .every((prevMod) => {
          const prevTasks = prevMod.tasks;
          return prevTasks.every(
            (task) =>
              (effectiveStatuses[task.id] ?? task.status) === 'completed',
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
  }, [modules, effectiveStatuses]);

  const activeModuleId = useMemo(
    () => deriveActiveModuleId(modules, effectiveStatuses),
    [modules, effectiveStatuses],
  );
  const isPlanComplete =
    modules.length > 0 &&
    modules.every(
      (mod) =>
        mod.tasks.length > 0 &&
        mod.tasks.every(
          (task) => (effectiveStatuses[task.id] ?? task.status) === 'completed',
        ),
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
        : [...prev, moduleId],
    );
  };

  const handleTaskStatusChange = (
    taskId: string,
    nextStatus: ProgressStatus,
  ) => {
    const currentStatus = effectiveStatuses[taskId] ?? 'not_started';
    const nextStatuses =
      currentStatus === nextStatus
        ? effectiveStatuses
        : {
            ...effectiveStatuses,
            [taskId]: nextStatus,
          };
    const completedModuleIds = deriveCompletedModuleIds(modules, nextStatuses);
    const nextActiveModuleId = deriveActiveModuleId(modules, nextStatuses);

    setExpandedModuleIds((prev) => {
      const prevWithoutCompleted = prev.filter(
        (moduleId) => !completedModuleIds.has(moduleId),
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
      <Card className="text-center">
        <CardContent className="p-6">
          <p className="text-stone-500 dark:text-stone-400">
            No modules available yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="mt-12 scroll-mt-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-bold text-stone-900 dark:text-stone-100">
          Learning Modules
        </h2>
        <span className="text-sm text-stone-500 dark:text-stone-400">
          {modules.length} module{modules.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="relative pb-4">
        <div
          className="pointer-events-none absolute top-3 bottom-10 left-8 w-0.5 -translate-x-1/2 bg-linear-to-b from-primary/50 via-primary/90 to-transparent dark:from-primary/70 dark:via-primary dark:to-transparent"
          aria-hidden
        />

        <Accordion
          type="multiple"
          value={visibleExpandedModuleIds}
          className="space-y-4 pb-2"
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

        <div className="mt-5 flex items-stretch">
          <div className="relative flex w-16 shrink-0 items-center justify-center">
            <div
              className={cn(
                'z-10 flex h-8 w-8 items-center justify-center rounded-full border-[3px] bg-white shadow-sm dark:bg-stone-900',
                isPlanComplete
                  ? 'border-success text-success'
                  : 'border-stone-300 text-stone-400 dark:border-stone-600 dark:text-stone-500',
              )}
            >
              {isPlanComplete ? (
                <CheckCircle2 size={18} className="fill-success/15" />
              ) : (
                <Flag size={16} />
              )}
            </div>
          </div>
          <div
            className={cn(
              'flex-1 rounded-2xl border p-5 shadow-sm',
              isPlanComplete
                ? 'border-success/30 bg-success/5 dark:border-success/30 dark:bg-success/10'
                : 'border-dashed border-stone-200 bg-stone-50/60 dark:border-stone-800 dark:bg-stone-900/60',
            )}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p
                  className={cn(
                    'text-sm font-semibold',
                    isPlanComplete
                      ? 'text-success'
                      : 'text-stone-500 dark:text-stone-400',
                  )}
                >
                  {isPlanComplete ? 'Congratulations!' : 'End of plan'}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-stone-900 dark:text-stone-100">
                  {isPlanComplete
                    ? 'You have completed all modules in this plan.'
                    : 'This is the end of the plan.'}
                </h3>
              </div>
              <span
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-semibold',
                  isPlanComplete
                    ? 'bg-success/15 text-success dark:bg-success/25'
                    : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
                )}
              >
                {modules.length} module{modules.length !== 1 ? 's' : ''}{' '}
                {isPlanComplete ? 'finished' : 'total'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
