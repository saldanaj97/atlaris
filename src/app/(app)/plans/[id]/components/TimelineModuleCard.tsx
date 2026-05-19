'use client';

import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Lock,
} from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';
import { getResourceIcon } from '@/app/(app)/plans/resource-display';
import { UpdateTaskStatusButton } from '@/app/(app)/plans/[id]/components/UpdateTaskStatusButton';
import { AccordionContent, AccordionItem } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { formatMinutes } from '@/features/plans/formatters';
import { cn } from '@/lib/utils';
import type { ClientTask } from '@/shared/types/client.types';
import type { ProgressStatus } from '@/shared/types/db.types';

type ModuleStatus = 'completed' | 'active' | 'locked';

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

function getMarkerClassName(status: ModuleStatus): string {
  if (status === 'completed') return 'border-success text-success';
  if (status === 'active') {
    return 'scale-110 border-primary text-primary shadow-[0_0_12px_hsl(var(--primary)/0.4)]';
  }
  return 'border-stone-300 text-stone-300 dark:border-stone-600 dark:text-stone-600';
}

function getCardClassName(status: ModuleStatus): string {
  if (status === 'active') {
    return 'border-primary/30 bg-white shadow-md dark:border-primary/50 dark:bg-stone-900';
  }
  if (status === 'locked') {
    return 'border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-900/70';
  }
  return 'border-stone-100 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900';
}

function getWeekBadgeClassName(status: ModuleStatus): string {
  if (status === 'active') {
    return 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary';
  }
  if (status === 'completed') {
    return 'bg-success/15 text-success dark:bg-success/25 dark:text-success-foreground';
  }
  return 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400';
}

function getTitleClassName(status: ModuleStatus): string {
  if (status === 'active') return 'text-stone-900 dark:text-stone-100';
  if (status === 'locked') return 'text-stone-600 dark:text-stone-400';
  return 'text-stone-700 dark:text-stone-300';
}

function TimelineModuleMarker({ status }: { status: ModuleStatus }) {
  return (
    <div
      className={cn(
        'z-10 flex h-6 w-6 items-center justify-center rounded-full border-[3px] bg-white transition-all duration-500 ease-out dark:bg-stone-900',
        getMarkerClassName(status),
      )}
    >
      {status === 'completed' && (
        <CheckCircle2 size={14} className="fill-green-100" />
      )}
      {status === 'active' && (
        <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
      )}
      {status === 'locked' && <Lock size={10} />}
    </div>
  );
}

function TimelineResourceLink({
  resource,
}: {
  resource: NonNullable<ClientTask['resources']>[number];
}) {
  const Icon = getResourceIcon(resource.type);

  return (
    <Button
      key={resource.id}
      variant="outline"
      asChild
      className="h-auto max-w-full justify-start rounded-lg px-2.5 py-1.5 text-left text-xs whitespace-normal"
    >
      <a href={resource.url} target="_blank" rel="noopener noreferrer">
        <Icon size={14} className="shrink-0" />
        <span className="wrap-break-word">{resource.title}</span>
        <ExternalLink size={12} className="shrink-0 opacity-50" />
      </a>
    </Button>
  );
}

function TimelineTaskCard({
  task,
  status,
  onTaskStatusChange,
}: {
  task: ClientTask;
  status: ProgressStatus;
  onTaskStatusChange: (taskId: string, nextStatus: ProgressStatus) => void;
}) {
  const isCompleted = status === 'completed';
  const resources = task.resources ?? [];

  return (
    <div
      className={cn(
        'rounded-2xl border p-4 transition-colors',
        isCompleted
          ? 'border-success/30 bg-success/5 dark:border-success/30 dark:bg-success/10'
          : 'border-stone-100 bg-stone-50/50 hover:border-primary/30 dark:border-stone-800 dark:bg-stone-800/50 dark:hover:border-primary/50',
      )}
    >
      <div className="flex h-full flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex shrink-0 items-center">
          <CheckCircle2
            size={18}
            className={cn(
              isCompleted
                ? 'fill-success/20 text-success dark:text-success'
                : 'text-stone-300 dark:text-stone-600',
            )}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-start justify-center">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={cn(
                'font-medium wrap-break-word',
                isCompleted
                  ? 'text-success dark:text-success'
                  : 'text-stone-800 dark:text-stone-200',
              )}
            >
              {task.title}
            </p>
            <span className="text-xs text-stone-400 dark:text-stone-500">
              {formatMinutes(task.estimatedMinutes)}
            </span>
          </div>
          {task.description && (
            <p className="mt-1 text-sm wrap-break-word text-stone-500 dark:text-stone-400">
              {task.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center self-end sm:self-auto">
          <UpdateTaskStatusButton
            taskId={task.id}
            status={status}
            onStatusChange={onTaskStatusChange}
          />
        </div>
      </div>

      {resources.length > 0 && (
        <div className="mt-3 ml-0 flex flex-wrap gap-2 sm:ml-6">
          {resources.map((resource) => (
            <TimelineResourceLink key={resource.id} resource={resource} />
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineTaskList({
  module,
  statuses,
  onTaskStatusChange,
}: {
  module: TimelineModule;
  statuses: Partial<Record<string, ProgressStatus>>;
  onTaskStatusChange: (taskId: string, nextStatus: ProgressStatus) => void;
}) {
  if (module.tasks.length === 0) {
    return (
      <p className="text-sm text-stone-400 dark:text-stone-500">
        No tasks in this module.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {module.tasks.map((task) => (
        <TimelineTaskCard
          key={task.id}
          task={task}
          status={statuses[task.id] ?? 'not_started'}
          onTaskStatusChange={onTaskStatusChange}
        />
      ))}
    </div>
  );
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
          getCardClassName(module.status),
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
                  getWeekBadgeClassName(module.status),
                )}
              >
                Week {module.order}
              </span>
              <span className="text-xs text-stone-400 dark:text-stone-500">
                {module.duration}
              </span>
              {module.tasks.length > 0 && (
                <span className="text-xs text-stone-400 dark:text-stone-500">
                  • {module.completedTasks}/{module.tasks.length} tasks
                </span>
              )}
            </div>
            <h3
              className={cn(
                'font-semibold wrap-break-word',
                getTitleClassName(module.status),
              )}
            >
              {module.title}
            </h3>
            {module.description && (
              <div className="mt-1 line-clamp-1 group-data-[state=open]/accordion:line-clamp-none">
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  {module.description}
                </p>
              </div>
            )}
          </div>
          {!isLocked && (
            <ChevronRight
              size={20}
              className={cn(
                'mt-0.5 shrink-0 text-stone-400 transition-transform duration-300 dark:text-stone-500',
                isOpen ? '-rotate-90' : 'rotate-90',
              )}
            />
          )}
        </Button>

        <AccordionContent
          id={`module-content-${module.id}`}
          className="px-4 pb-4"
        >
          <div className="border-t border-stone-100 pt-4 dark:border-stone-800">
            <TimelineTaskList
              module={module}
              statuses={statuses}
              onTaskStatusChange={onTaskStatusChange}
            />

            <div className="mt-4 flex justify-end">
              <Button
                asChild
                variant="soft-primary"
                size="sm"
                className="h-auto px-4 py-2"
              >
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
