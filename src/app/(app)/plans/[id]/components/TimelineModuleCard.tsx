'use client';

import { AccordionContent, AccordionItem } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import {
  getTimelineCardClassName,
  getTimelineTitleClassName,
  getTimelineWeekBadgeClassName,
  type ModuleStatus,
} from '@/app/(app)/plans/plans-progress-theme';
import { cn } from '@/lib/utils';
import type { ClientTask } from '@/shared/types/client.types';
import type { ProgressStatus } from '@/shared/types/db.types';
import { ArrowRight, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';
import { TimelineModuleMarker } from './TimelineModuleMarker';
import { TimelineTaskList } from './TimelineTaskList';

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

interface TimelineModuleCardProps {
  planId: string;
  module: TimelineModule;
  isOpen: boolean;
  statuses: Partial<Record<string, ProgressStatus>>;
  onModuleToggle: (moduleId: string) => void;
  onTaskStatusChange: (taskId: string, nextStatus: ProgressStatus) => void;
}

export function TimelineModuleCard({
  planId,
  module,
  isOpen,
  statuses,
  onModuleToggle,
  onTaskStatusChange,
}: TimelineModuleCardProps): JSX.Element {
  const isLocked = module.status === 'locked';

  return (
    <div
      id={`module-${module.id}`}
      className="group relative flex items-stretch"
    >
      <div className="relative flex w-16 shrink-0 items-center justify-center">
        <TimelineModuleMarker status={module.status} />
      </div>

      <AccordionItem
        value={module.id}
        disabled={isLocked}
        className={cn(
          'group/accordion flex flex-1 flex-col rounded-2xl border transition-all duration-300',
          getTimelineCardClassName(module.status),
        )}
      >
        <Button
          type="button"
          variant="ghost"
          disabled={isLocked}
          onClick={() => onModuleToggle(module.id)}
          aria-expanded={isOpen}
          aria-controls={`module-content-${module.id}`}
          className={cn(
            'h-auto w-full justify-start gap-4 rounded-[inherit] p-4 text-left whitespace-normal',
            isLocked ? 'cursor-not-allowed' : 'cursor-pointer',
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <span
                className={cn(
                  'rounded-md px-2 py-0.5 text-xs font-semibold',
                  getTimelineWeekBadgeClassName(module.status),
                )}
              >
                Week {module.order}
              </span>
              <span className="text-xs text-muted-foreground">
                {module.duration}
              </span>
              {module.tasks.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  • {module.completedTasks}/{module.tasks.length} tasks
                </span>
              )}
            </div>
            <h3
              className={cn(
                'font-semibold wrap-break-word',
                getTimelineTitleClassName(module.status),
              )}
            >
              {module.title}
            </h3>
            {module.description && (
              <div className="mt-1 line-clamp-1 group-data-[state=open]/accordion:line-clamp-none">
                <p className="text-sm text-muted-foreground">
                  {module.description}
                </p>
              </div>
            )}
          </div>
          {!isLocked && (
            <ChevronRight
              size={20}
              className={cn(
                'mt-0.5 shrink-0 text-muted-foreground transition-transform duration-300',
                isOpen ? '-rotate-90' : 'rotate-90',
              )}
            />
          )}
        </Button>

        <AccordionContent
          id={`module-content-${module.id}`}
          className="px-4 pb-4"
        >
          <div className="border-t border-border pt-4">
            <TimelineTaskList
              module={module}
              statuses={statuses}
              onTaskStatusChange={onTaskStatusChange}
            />

            <div className="mt-4 flex justify-end">
              <Button asChild variant="soft-primary" size="sm">
                <Link href={`/plans/${planId}/modules/${module.id}`}>
                  View Full Module
                  <ArrowRight size={16} />
                </Link>
              </Button>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </div>
  );
}
