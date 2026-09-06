'use client';

import type { ClientModule } from '@/shared/types/client.types';
import type { ProgressStatus } from '@/shared/types/db.types';

import {
  deriveTimelineModules,
  getNextExpandedModuleIds,
  getVisibleExpandedModuleIds,
  isPlanTimelineComplete,
} from './plan-timeline-state';
import { TimelinePlanFooter } from './TimelinePlanFooter';
import { TimelineModuleCard } from '@/app/(app)/plans/[id]/components/TimelineModuleCard';
import { Accordion } from '@/components/ui/accordion';
import { Surface } from '@/components/ui/surface';
import { formatMinutes } from '@/features/plans/formatters';
import {
  buildTaskStatusMap as getStatusesFromModules,
  deriveActiveModuleId,
} from '@/features/plans/task-progress/client';
import { useState } from 'react';

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
}: ModuleTimelineProps) {
  const effectiveStatuses = statuses ?? getStatusesFromModules(modules);

  const timelineModules = deriveTimelineModules(modules, effectiveStatuses);

  const activeModuleId = deriveActiveModuleId(modules, effectiveStatuses);
  const isPlanComplete = isPlanTimelineComplete(modules, effectiveStatuses);

  const [expandedModuleIds, setExpandedModuleIds] = useState<string[]>(() => {
    return activeModuleId ? [activeModuleId] : [];
  });
  const visibleExpandedModuleIds = getVisibleExpandedModuleIds(
    expandedModuleIds,
    activeModuleId,
  );
  const estimatedMinutes = modules.reduce(
    (total, module) => total + module.estimatedMinutes,
    0,
  );

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

    setExpandedModuleIds((prev) =>
      getNextExpandedModuleIds({
        previousExpandedModuleIds: prev,
        modules,
        nextStatuses,
      }),
    );

    onStatusChange(taskId, nextStatus);
  };

  if (modules.length === 0) {
    return (
      <section id='learning-path' className='scroll-mt-8'>
        <Surface padding='none' className='overflow-hidden'>
          <div className='border-b border-border/60 px-5 py-5 sm:px-6'>
            <p className='text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase'>
              Route
            </p>
            <h2 className='mt-1 text-xl font-semibold text-foreground'>
              Your learning path
            </h2>
          </div>
          <div className='p-6 text-center'>
            <p className='text-muted-foreground'>No modules available yet.</p>
          </div>
        </Surface>
      </section>
    );
  }

  return (
    <section id='learning-path' className='scroll-mt-8'>
      <Surface padding='none' className='overflow-hidden'>
        <div className='flex flex-col gap-3 border-b border-border/60 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6'>
          <div className='min-w-0'>
            <p className='text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase'>
              Route
            </p>
            <h2 className='mt-1 text-xl font-semibold text-foreground'>
              Your learning path
            </h2>
            <p className='mt-1 text-sm text-muted-foreground'>
              {modules.length} module{modules.length !== 1 ? 's' : ''} ·{' '}
              {formatMinutes(estimatedMinutes)} estimated
            </p>
          </div>
          <span className='shrink-0 text-xs text-muted-foreground'>
            {isPlanComplete ? 'Route complete' : 'Keep moving at your pace'}
          </span>
        </div>

        <div className='relative px-3 py-5 sm:px-5'>
          <div
            className='pointer-events-none absolute top-8 bottom-14 left-8 w-px -translate-x-1/2 bg-border/70'
            aria-hidden
          />
          <Accordion
            type='multiple'
            value={visibleExpandedModuleIds}
            className='space-y-4 pb-2'
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

          <TimelinePlanFooter
            isPlanComplete={isPlanComplete}
            moduleCount={modules.length}
          />
        </div>
      </Surface>
    </section>
  );
}
