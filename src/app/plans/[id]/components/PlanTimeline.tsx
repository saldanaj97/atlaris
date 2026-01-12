'use client';

import Link from 'next/link';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
import { useMemo } from 'react';
import { UpdateTaskStatusButton } from './UpdateTaskStatusButton';

import type { ClientModule, ClientTask } from '@/lib/types/client';
import type { ProgressStatus, ResourceType } from '@/lib/types/db';

interface ModuleTimelineProps {
  planId: string;
  modules: ClientModule[];
  statuses: Record<string, ProgressStatus>;
  setStatuses: React.Dispatch<
    React.SetStateAction<Record<string, ProgressStatus>>
  >;
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

const RESOURCE_CONFIG: Record<
  ResourceType,
  { label: string; icon: React.ElementType; badgeClass: string }
> = {
  youtube: {
    label: 'Video',
    icon: PlayCircle,
    badgeClass:
      'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400',
  },
  article: {
    label: 'Article',
    icon: FileText,
    badgeClass:
      'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400',
  },
  course: {
    label: 'Course',
    icon: Target,
    badgeClass:
      'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400',
  },
  doc: {
    label: 'Documentation',
    icon: FileText,
    badgeClass:
      'bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400',
  },
  other: {
    label: 'Resource',
    icon: LinkIcon,
    badgeClass:
      'bg-slate-500/10 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400',
  },
};

/**
 * Determines the status of a module based on its tasks' progress.
 */
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

/**
 * Interactive timeline showing module progress with expandable task lists.
 * Uses shadcn Accordion for accessible expand/collapse functionality.
 */
export function PlanTimeline({
  planId,
  modules,
  statuses,
  setStatuses,
}: ModuleTimelineProps) {
  // Transform modules into timeline items with computed status
  const timelineModules: TimelineModule[] = useMemo(() => {
    let previousModulesCompleted = true;

    return modules.map((mod, index) => {
      const tasks = mod.tasks ?? [];
      const completedCount = tasks.filter(
        (t) => statuses[t.id] === 'completed'
      ).length;
      const status = getModuleStatus(mod, statuses, previousModulesCompleted);

      if (status !== 'completed') {
        previousModulesCompleted = false;
      }

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
  }, [modules, statuses]);

  // Find the active module for default expansion and header display
  const activeModule = timelineModules.find((m) => m.status === 'active');
  const defaultExpandedId = activeModule?.id;

  const handleStatusChange = (taskId: string, nextStatus: ProgressStatus) => {
    setStatuses((prev) => {
      if (prev[taskId] === nextStatus) return prev;
      return { ...prev, [taskId]: nextStatus };
    });
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
      {/* Section Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-stone-900 dark:text-stone-100">
          Learning Modules
        </h2>
        <span className="text-sm text-stone-500 dark:text-stone-400">
          {modules.length} module{modules.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Timeline Container */}
      <div className="relative">
        {/* Vertical Line - positioned at center of the 64px (w-16) node column */}
        <div className="absolute top-0 bottom-0 left-8 w-0.5 -translate-x-1/2 bg-gradient-to-b from-purple-200 via-purple-400 to-stone-200 dark:from-purple-800 dark:via-purple-600 dark:to-stone-700" />

        <Accordion
          type="multiple"
          defaultValue={defaultExpandedId ? [defaultExpandedId] : []}
          className="space-y-4"
        >
          {timelineModules.map((mod) => {
            const isLocked = mod.status === 'locked';

            return (
              <div
                key={mod.id}
                id={`module-${mod.id}`}
                className={`group relative flex items-stretch ${isLocked ? 'opacity-60' : ''}`}
              >
                {/* Timeline Node Container - Self-centering with the module card */}
                <div className="relative flex w-16 shrink-0 items-center justify-center">
                  <div
                    className={`z-10 flex h-6 w-6 items-center justify-center rounded-full border-[3px] bg-white transition-all duration-500 ease-out dark:bg-stone-900 ${
                      mod.status === 'completed'
                        ? 'border-green-500 text-green-500'
                        : mod.status === 'active'
                          ? 'scale-110 border-purple-500 text-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.4)]'
                          : 'border-stone-300 text-stone-300 dark:border-stone-600 dark:text-stone-600'
                    }`}
                  >
                    {mod.status === 'completed' && (
                      <CheckCircle2 size={14} className="fill-green-100" />
                    )}
                    {mod.status === 'active' && (
                      <div className="h-2 w-2 animate-pulse rounded-full bg-purple-500" />
                    )}
                    {mod.status === 'locked' && <Lock size={10} />}
                  </div>
                </div>

                {/* Module Card using Accordion */}
                <AccordionItem
                  value={mod.id}
                  disabled={isLocked}
                  className={`flex-1 rounded-2xl border transition-all duration-300 ${
                    mod.status === 'active'
                      ? 'border-purple-200 bg-white shadow-md dark:border-purple-800 dark:bg-stone-900'
                      : 'border-stone-100 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900'
                  }`}
                >
                  <AccordionTrigger
                    hideChevron
                    className={`w-full p-4 hover:no-underline ${
                      isLocked ? 'cursor-not-allowed' : 'cursor-pointer'
                    }`}
                  >
                    <div className="flex-1 text-left">
                      <div className="mb-2 flex items-center gap-2">
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                            mod.status === 'active'
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                              : mod.status === 'completed'
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                                : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400'
                          }`}
                        >
                          Week {mod.order}
                        </span>
                        <span className="text-xs text-stone-400 dark:text-stone-500">
                          {mod.duration}
                        </span>
                        {mod.tasks.length > 0 && (
                          <span className="text-xs text-stone-400 dark:text-stone-500">
                            • {mod.completedTasks}/{mod.tasks.length} tasks
                          </span>
                        )}
                      </div>
                      <h4
                        className={`font-semibold ${
                          mod.status === 'active'
                            ? 'text-stone-900 dark:text-stone-100'
                            : 'text-stone-700 dark:text-stone-300'
                        }`}
                      >
                        {mod.title}
                      </h4>
                      {mod.description && (
                        <p className="mt-1 line-clamp-1 text-sm text-stone-500 group-[[data-state=open]]:hidden dark:text-stone-400">
                          {mod.description}
                        </p>
                      )}
                    </div>
                    {!isLocked && (
                      <ChevronRight
                        size={20}
                        className="mt-1 ml-4 shrink-0 rotate-90 text-stone-400 transition-transform duration-300 dark:text-stone-500"
                      />
                    )}
                  </AccordionTrigger>

                  <AccordionContent className="px-4 pb-4">
                    <div className="border-t border-stone-100 pt-4 dark:border-stone-800">
                      {mod.tasks.length === 0 ? (
                        <p className="text-sm text-stone-400 dark:text-stone-500">
                          No tasks in this module.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {mod.tasks.map((task) => {
                            const taskStatus =
                              statuses[task.id] ?? 'not_started';
                            const isCompleted = taskStatus === 'completed';
                            const resources = task.resources ?? [];

                            return (
                              <div
                                key={task.id}
                                className={`rounded-xl border p-4 transition-colors ${
                                  isCompleted
                                    ? 'border-green-200 bg-green-50/50 dark:border-green-800/50 dark:bg-green-950/20'
                                    : 'border-stone-100 bg-stone-50/50 hover:border-purple-200 dark:border-stone-800 dark:bg-stone-800/50 dark:hover:border-purple-800'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <CheckCircle2
                                        size={18}
                                        className={
                                          isCompleted
                                            ? 'fill-green-100 text-green-600 dark:text-green-400'
                                            : 'text-stone-300 dark:text-stone-600'
                                        }
                                      />
                                      <h5
                                        className={`font-medium ${
                                          isCompleted
                                            ? 'text-green-700 dark:text-green-400'
                                            : 'text-stone-800 dark:text-stone-200'
                                        }`}
                                      >
                                        {task.title}
                                      </h5>
                                    </div>
                                    {task.description && (
                                      <p className="mt-1 ml-6 text-sm text-stone-500 dark:text-stone-400">
                                        {task.description}
                                      </p>
                                    )}
                                    <div className="mt-2 ml-6 text-xs text-stone-400 dark:text-stone-500">
                                      {formatMinutes(task.estimatedMinutes)}
                                    </div>
                                  </div>
                                  <UpdateTaskStatusButton
                                    planId={planId}
                                    taskId={task.id}
                                    status={taskStatus}
                                    onStatusChange={handleStatusChange}
                                  />
                                </div>

                                {/* Resources */}
                                {resources.length > 0 && (
                                  <div className="mt-3 ml-6 flex flex-wrap gap-2">
                                    {resources.map((resource) => {
                                      const config =
                                        RESOURCE_CONFIG[resource.type];
                                      const Icon = config.icon;
                                      return (
                                        <a
                                          key={resource.id}
                                          href={resource.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:border-purple-300 hover:text-purple-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:border-purple-700 dark:hover:text-purple-400"
                                        >
                                          <Icon size={14} />
                                          {resource.title}
                                          <ExternalLink
                                            size={12}
                                            className="opacity-50"
                                          />
                                        </a>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* View Module Link */}
                      <div className="mt-4 flex justify-end">
                        <Link
                          href={`/plans/${planId}/modules/${mod.id}`}
                          className="inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50"
                        >
                          View Full Module
                          <ArrowRight size={16} />
                        </Link>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </div>
            );
          })}
        </Accordion>
      </div>
    </section>
  );
}
