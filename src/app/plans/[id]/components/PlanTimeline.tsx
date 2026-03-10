'use client';

import type { ElementType, JSX } from 'react';

import { getStatusesFromModules } from '@/app/plans/[id]/helpers';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { formatMinutes } from '@/lib/formatters';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Lock,
  PlayCircle,
  Target,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { UpdateTaskStatusButton } from './UpdateTaskStatusButton';

import type { ClientModule, ClientTask } from '@/lib/types/client';
import type { ProgressStatus, ResourceType } from '@/lib/types/db';

interface ModuleTimelineProps {
  planId: string;
  modules: ClientModule[];
  statuses?: Record<string, ProgressStatus>;
  onStatusChange: (taskId: string, newStatus: ProgressStatus) => void;
}

type ModuleStatus = 'completed' | 'active' | 'locked';

interface TimelineModule {
  id: string;
  order: number;
  title: string;
  description: string | null;
  status: ModuleStatus;
  duration: string;
  tasks: ClientTask[];
  completedTasks: number;
}

const RESOURCE_CONFIG: Record<ResourceType, ElementType> = {
  youtube: PlayCircle,
  article: FileText,
  course: Target,
  doc: FileText,
  other: LinkIcon,
};

function getModuleStatus(
  mod: ClientModule,
  statuses: Record<string, ProgressStatus>,
  previousModulesCompleted: boolean
): ModuleStatus {
  const tasks = mod.tasks ?? [];
  if (tasks.length === 0) return previousModulesCompleted ? 'active' : 'locked';

  const taskStatuses = tasks.map((t) => statuses[t.id] ?? 'not_started');
  const allCompleted = taskStatuses.every((s) => s === 'completed');
  const hasInProgress = taskStatuses.some((s) => s === 'in_progress');
  const hasAnyStarted = taskStatuses.some(
    (s) => s === 'in_progress' || s === 'completed'
  );

  if (allCompleted) return 'completed';
  if (hasInProgress || (previousModulesCompleted && hasAnyStarted))
    return 'active';
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

interface TimelineModuleCardProps {
  planId: string;
  module: TimelineModule;
  isOpen: boolean;
  statuses: Record<string, ProgressStatus>;
  onModuleToggle: (moduleId: string) => void;
  onTaskStatusChange: (taskId: string, nextStatus: ProgressStatus) => void;
}

function TimelineModuleCard({
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
        <div
          className={`z-10 flex h-6 w-6 items-center justify-center rounded-full border-[3px] bg-white transition-all duration-500 ease-out dark:bg-stone-900 ${
            module.status === 'completed'
              ? 'border-green-500 text-green-500'
              : module.status === 'active'
                ? 'border-primary text-primary scale-110 shadow-[0_0_12px_hsl(var(--primary)/0.4)]'
                : 'border-stone-300 text-stone-300 dark:border-stone-600 dark:text-stone-600'
          }`}
        >
          {module.status === 'completed' && (
            <CheckCircle2 size={14} className="fill-green-100" />
          )}
          {module.status === 'active' && (
            <div className="bg-primary h-2 w-2 animate-pulse rounded-full" />
          )}
          {module.status === 'locked' && <Lock size={10} />}
        </div>
      </div>

      <AccordionItem
        value={module.id}
        disabled={isLocked}
        className={`group/accordion flex flex-1 flex-col rounded-2xl border transition-all duration-300 ${
          module.status === 'active'
            ? 'border-primary/30 dark:border-primary/50 bg-white shadow-md dark:bg-stone-900'
            : isLocked
              ? 'border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-900/70'
              : 'border-stone-100 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900'
        }`}
      >
        <Button
          type="button"
          variant="ghost"
          disabled={isLocked}
          onClick={() => {
            if (isLocked) {
              return;
            }

            onModuleToggle(module.id);
          }}
          aria-expanded={isOpen}
          aria-controls={`module-content-${module.id}`}
          className={`h-auto w-full justify-start gap-4 rounded-[inherit] p-4 text-left whitespace-normal ${
            isLocked ? 'cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                  module.status === 'active'
                    ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary'
                    : module.status === 'completed'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                      : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400'
                }`}
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
              className={`font-semibold wrap-break-word ${
                module.status === 'active'
                  ? 'text-stone-900 dark:text-stone-100'
                  : module.status === 'locked'
                    ? 'text-stone-600 dark:text-stone-400'
                    : 'text-stone-700 dark:text-stone-300'
              }`}
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
              className={`mt-0.5 shrink-0 text-stone-400 transition-transform duration-300 dark:text-stone-500 ${
                isOpen ? '-rotate-90' : 'rotate-90'
              }`}
            />
          )}
        </Button>

        <AccordionContent
          id={`module-content-${module.id}`}
          className="px-4 pb-4"
        >
          <div className="border-t border-stone-100 pt-4 dark:border-stone-800">
            {module.tasks.length === 0 ? (
              <p className="text-sm text-stone-400 dark:text-stone-500">
                No tasks in this module.
              </p>
            ) : (
              <div className="space-y-3">
                {module.tasks.map((task) => {
                  const taskStatus = statuses[task.id] ?? 'not_started';
                  const isCompleted = taskStatus === 'completed';
                  const resources = task.resources ?? [];

                  return (
                    <div
                      key={task.id}
                      className={`rounded-2xl border p-4 transition-colors ${
                        isCompleted
                          ? 'border-green-200 bg-green-50/50 dark:border-green-800/50 dark:bg-green-950/20'
                          : 'hover:border-primary/30 dark:hover:border-primary/50 border-stone-100 bg-stone-50/50 dark:border-stone-800 dark:bg-stone-800/50'
                      }`}
                    >
                      <div className="flex h-full flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="flex shrink-0 items-center">
                          <CheckCircle2
                            size={18}
                            className={
                              isCompleted
                                ? 'fill-green-100 text-green-600 dark:text-green-400'
                                : 'text-stone-300 dark:text-stone-600'
                            }
                          />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col items-start justify-center">
                          <div className="flex flex-wrap items-center gap-2">
                            <p
                              className={`font-medium ${
                                isCompleted
                                  ? 'text-green-700 dark:text-green-400'
                                  : 'text-stone-800 dark:text-stone-200'
                              } wrap-break-word`}
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
                            status={taskStatus}
                            onStatusChange={onTaskStatusChange}
                          />
                        </div>
                      </div>

                      {resources.length > 0 && (
                        <div className="mt-3 ml-0 flex flex-wrap gap-2 sm:ml-6">
                          {resources.map((resource) => {
                            const Icon = RESOURCE_CONFIG[resource.type];
                            return (
                              <Button
                                key={resource.id}
                                variant="outline"
                                asChild
                                className="h-auto max-w-full justify-start rounded-lg px-2.5 py-1.5 text-left text-xs whitespace-normal"
                              >
                                <a
                                  href={resource.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <Icon size={14} className="shrink-0" />
                                  <span className="wrap-break-word">
                                    {resource.title}
                                  </span>
                                  <ExternalLink
                                    size={12}
                                    className="shrink-0 opacity-50"
                                  />
                                </a>
                              </Button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 dark:border-primary/50 dark:bg-primary/20 dark:text-primary dark:hover:bg-primary/30 h-auto rounded-xl px-4 py-2"
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
        (t) => effectiveStatuses[t.id] === 'completed'
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
    const nextActiveModuleId = getActiveModuleIdForStatuses(
      modules,
      nextStatuses
    );

    if (nextActiveModuleId) {
      setExpandedModuleIds((prev) =>
        prev.includes(nextActiveModuleId) ? prev : [...prev, nextActiveModuleId]
      );
    }

    onStatusChange(taskId, nextStatus);
  };

  if (modules.length === 0) {
    return (
      <div className="rounded-2xl border border-stone-100 bg-white p-6 text-center dark:border-stone-800 dark:bg-stone-900">
        <p className="text-stone-500 dark:text-stone-400">
          No modules available yet.
        </p>
      </div>
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
          value={expandedModuleIds}
          className="space-y-4"
        >
          {timelineModules.map((mod) => {
            return (
              <TimelineModuleCard
                key={mod.id}
                planId={planId}
                module={mod}
                isOpen={expandedModuleIds.includes(mod.id)}
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
