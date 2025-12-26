'use client';

import type { ElementType } from 'react';

import { formatMinutes } from '@/lib/formatters';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import {
  CheckCircle2,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  PlayCircle,
  Target,
} from 'lucide-react';

import type { ClientModule } from '@/lib/types/client';
import type { ProgressStatus, ResourceType } from '@/lib/types/db';
import { UpdateTaskStatusButton } from './UpdateTaskStatusButton';

interface PlanModuleCardProps {
  planId: string;
  module: ClientModule;
  statuses: Record<string, ProgressStatus>;
  setStatuses: React.Dispatch<
    React.SetStateAction<Record<string, ProgressStatus>>
  >;
}

const RESOURCE_CONFIG: Record<
  ResourceType,
  { label: string; icon: ElementType; badgeClass: string }
> = {
  youtube: {
    label: 'Video',
    icon: PlayCircle,
    badgeClass: 'bg-red-500/10 text-red-600',
  },
  article: {
    label: 'Article',
    icon: FileText,
    badgeClass: 'bg-blue-500/10 text-blue-600',
  },
  course: {
    label: 'Course',
    icon: Target,
    badgeClass: 'bg-amber-500/10 text-amber-600',
  },
  doc: {
    label: 'Documentation',
    icon: FileText,
    badgeClass: 'bg-purple-500/10 text-purple-600',
  },
  other: {
    label: 'Resource',
    icon: LinkIcon,
    badgeClass: 'bg-slate-500/10 text-slate-600',
  },
};

export const PlanModuleCard = ({
  planId,
  module,
  statuses,
  setStatuses,
}: PlanModuleCardProps) => {
  const moduleTasks = module.tasks ?? [];

  // Handle status changes - React Compiler auto-memoizes this callback
  const handleStatusChange = (taskId: string, nextStatus: ProgressStatus) => {
    setStatuses((prev) => {
      if (prev[taskId] === nextStatus) {
        return prev;
      }

      return {
        ...prev,
        [taskId]: nextStatus,
      };
    });
  };

  // Calculate progress stats - React Compiler auto-memoizes derived values
  const totalTasks = moduleTasks.length;
  const completedCount = moduleTasks.reduce((count, task) => {
    return statuses[task.id] === 'completed' ? count + 1 : count;
  }, 0);
  const moduleCompleted = totalTasks > 0 && completedCount === totalTasks;

  // Progress badge JSX - React Compiler handles this automatically
  const progressBadge =
    totalTasks === 0 ? null : moduleCompleted ? (
      <Badge className="flex items-center gap-1 border border-green-200 bg-green-500/10 px-2.5 py-0.5 text-green-700">
        <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
        <span>Completed</span>
        <span className="sr-only">Module completed</span>
      </Badge>
    ) : (
      <Badge
        variant="default"
        className="border-muted-foreground/20 text-muted-foreground"
      >
        {completedCount}/{totalTasks}
      </Badge>
    );

  return (
    <Card className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="text-muted-foreground text-sm font-medium">
            Week {module.order}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xl font-semibold">{module.title}</h3>
            {progressBadge}
          </div>
          {module.description ? (
            <p className="text-muted-foreground mt-2 text-sm">
              {module.description}
            </p>
          ) : null}
        </div>
        <Badge variant="default">
          {formatMinutes(module.estimatedMinutes)}
        </Badge>
      </div>

      <div className="space-y-4">
        {moduleTasks.map((task) => {
          const resources = task.resources ?? [];
          const status = statuses[task.id] ?? 'not_started';
          const isCompleted = status === 'completed';

          return (
            <div
              key={task.id}
              className={`hover:border-primary/30 rounded-lg border p-4 transition-colors ${isCompleted ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20' : 'bg-card-background'}`}
            >
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <CardTitle
                    className={`flex items-center text-left ${
                      isCompleted ? 'text-green-600' : 'text-muted-foreground'
                    }`}
                  >
                    <CheckCircle2
                      className={`mr-2 h-5 w-5 ${
                        isCompleted
                          ? 'fill-white text-green-600'
                          : 'text-muted-foreground'
                      } ${isCompleted ? 'animate-pulse' : ''}`}
                    />
                    {task.title}
                  </CardTitle>
                  {task.description ? (
                    <CardDescription className="text-muted-foreground">
                      {task.description}
                    </CardDescription>
                  ) : null}
                  <div className="text-muted-foreground text-xs">
                    Effort: {formatMinutes(task.estimatedMinutes)}
                  </div>
                </div>
                <div className="text-muted-foreground text-xs uppercase">
                  Status: {isCompleted ? 'Completed' : 'Not started'}
                </div>
              </CardHeader>

              {resources.length ? (
                <CardContent className="mt-4 flex space-y-2">
                  <div className="flex w-full flex-col">
                    <div className="text-muted-foreground text-xs font-semibold uppercase">
                      Recommended Resources
                    </div>
                    <div className="grid sm:grid-cols-2">
                      {resources.map((resource) => {
                        const config = RESOURCE_CONFIG[resource.type];
                        const Icon = config.icon;
                        return (
                          <a
                            key={resource.id}
                            href={resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:border-primary/40 rounded-lg border p-3 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <Badge className={config.badgeClass}>
                                <Icon className="mr-1 h-4 w-4" />
                                {config.label}
                              </Badge>
                              <div className="space-y-1">
                                <div className="text-sm font-medium">
                                  {resource.title}
                                </div>
                                {resource.durationMinutes ? (
                                  <div className="text-muted-foreground text-xs">
                                    {formatMinutes(resource.durationMinutes)}
                                  </div>
                                ) : null}
                              </div>
                              <ExternalLink className="text-muted-foreground ml-auto h-4 w-4" />
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex flex-col justify-end">
                    <CardAction>
                      <UpdateTaskStatusButton
                        planId={planId}
                        taskId={task.id}
                        status={status}
                        onStatusChange={handleStatusChange}
                      />
                    </CardAction>
                  </div>
                </CardContent>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default PlanModuleCard;
