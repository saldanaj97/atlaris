import { CheckCircle2, ExternalLink } from 'lucide-react';
import { getResourceIcon } from '@/app/(app)/plans/resource-display';
import { UpdateTaskStatusButton } from '@/app/(app)/plans/[id]/components/UpdateTaskStatusButton';
import { Button } from '@/components/ui/button';
import { formatMinutes } from '@/features/plans/formatters';
import { cn } from '@/lib/utils';
import type { ClientTask } from '@/shared/types/client.types';
import type { ProgressStatus } from '@/shared/types/db.types';
import type { TimelineModule } from './TimelineModuleCard';

function TimelineResourceLink({
  resource,
}: {
  resource: NonNullable<ClientTask['resources']>[number];
}) {
  const Icon = getResourceIcon(resource.type);

  return (
    <Button
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

export function TimelineTaskList({
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
