'use client';

import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  PlayCircle,
  Target,
} from 'lucide-react';

import { formatMinutes } from '@/lib/formatters';
import type { TaskWithRelations } from '@/lib/types/db';
import type { ProgressStatus, ResourceType } from '@/lib/types/db';
import { TaskStatusButton } from './TaskStatusButton';

interface TaskCardProps {
  task: TaskWithRelations;
  planId: string;
  moduleId: string;
  status: ProgressStatus;
  onStatusChange: (taskId: string, nextStatus: ProgressStatus) => void;
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
 * Task card with glassmorphism styling for the module detail page.
 * Displays task info, status toggle, and linked resources.
 */
export function TaskCard({
  task,
  planId,
  moduleId,
  status,
  onStatusChange,
}: TaskCardProps) {
  const isCompleted = status === 'completed';
  const resources = task.resources ?? [];

  return (
    <div
      className={`group rounded-2xl border p-6 transition-all duration-300 ${
        isCompleted
          ? 'border-green-200/50 bg-green-50/30 backdrop-blur-sm dark:border-green-800/30 dark:bg-green-950/20'
          : 'border-white/40 bg-white/30 shadow-lg backdrop-blur-xl hover:border-purple-200 hover:shadow-xl dark:border-stone-800/50 dark:bg-stone-900/30 dark:hover:border-purple-800'
      }`}
    >
      {/* Task Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                isCompleted
                  ? 'bg-green-500 text-white'
                  : 'bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400'
              }`}
            >
              {isCompleted ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <span className="text-sm font-semibold">{task.order}</span>
              )}
            </div>
            <h3
              className={`text-lg font-semibold ${
                isCompleted
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-stone-900 dark:text-stone-100'
              }`}
            >
              {task.title}
            </h3>
          </div>

          {task.description && (
            <p className="mb-4 text-stone-600 dark:text-stone-400">
              {task.description}
            </p>
          )}

          {/* Task Meta */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-stone-500 dark:text-stone-400">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {formatMinutes(task.estimatedMinutes)}
            </span>
            {resources.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <LinkIcon className="h-4 w-4" />
                {resources.length} resource{resources.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Status Button */}
        <TaskStatusButton
          planId={planId}
          moduleId={moduleId}
          taskId={task.id}
          status={status}
          onStatusChange={onStatusChange}
        />
      </div>

      {/* Resources Section */}
      {resources.length > 0 && (
        <div className="mt-6 border-t border-stone-200/50 pt-6 dark:border-stone-700/50">
          <h4 className="mb-3 text-sm font-medium text-stone-700 dark:text-stone-300">
            Learning Resources
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {resources.map((taskResource) => {
              const resource = taskResource.resource;
              const config = RESOURCE_CONFIG[resource.type];
              const Icon = config.icon;

              return (
                <a
                  key={taskResource.id}
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/resource flex items-start gap-3 rounded-xl border border-white/40 bg-white/50 p-4 transition-all hover:border-purple-300 hover:bg-white/70 hover:shadow-md dark:border-stone-700/50 dark:bg-stone-800/50 dark:hover:border-purple-700 dark:hover:bg-stone-800/70"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${config.badgeClass}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="truncate font-medium text-stone-800 group-hover/resource:text-purple-700 dark:text-stone-200 dark:group-hover/resource:text-purple-400">
                        {resource.title}
                      </span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                      <span
                        className={`rounded px-1.5 py-0.5 ${config.badgeClass}`}
                      >
                        {config.label}
                      </span>
                      {resource.durationMinutes && (
                        <span>{formatMinutes(resource.durationMinutes)}</span>
                      )}
                    </div>
                    {taskResource.notes && (
                      <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                        {taskResource.notes}
                      </p>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
