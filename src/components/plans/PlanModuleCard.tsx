'use client';

import { useState, type ElementType } from 'react';

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

import { updateTaskProgress } from '@/lib/api/plans';
import type { ClientModule, ClientTask } from '@/lib/types/client';
import type { ProgressStatus, ResourceType } from '@/lib/types/db';
import { toast } from 'sonner';

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
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

  const toggleModuleCompletion = async (task: ClientTask) => {
    const current = statuses[task.id] ?? 'not_started';
    const next: ProgressStatus =
      current === 'completed' ? 'not_started' : 'completed';

    setPendingTaskId(task.id);
    try {
      await updateTaskProgress(planId, task.id, next);
      setStatuses((prev) => ({ ...prev, [task.id]: next }));
      toast.success(
        next === 'completed'
          ? 'Marked task as complete.'
          : 'Marked task as incomplete.'
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to update task progress. Please try again.';
      toast.error(message);
    } finally {
      setPendingTaskId(null);
    }
  };

  return (
    <Card className="border-0 p-6 shadow-sm">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-muted-foreground text-sm font-medium">
            Week {module.order}
          </div>
          <h3 className="text-xl font-semibold">{module.title}</h3>
          {module.description ? (
            <p className="text-muted-foreground mt-2 text-sm">
              {module.description}
            </p>
          ) : null}
        </div>
        <Badge variant="outline">
          {formatMinutes(module.estimatedMinutes)}
        </Badge>
      </div>

      <div className="space-y-4">
        {moduleTasks.map((task) => {
          const resources = task.resources ?? [];
          const status = statuses[task.id] ?? 'not_started';
          const isCompleted = status === 'completed';
          const pending = pendingTaskId === task.id;

          return (
            <div
              key={task.id}
              className="hover:border-primary/30 rounded-lg border p-4 transition-colors"
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
                      } ${pending ? 'animate-pulse' : ''}`}
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
                      <button
                        type="button"
                        onClick={() => void toggleModuleCompletion(task)}
                        disabled={pending}
                        aria-pressed={isCompleted}
                        className={`flex items-center rounded-xl px-4 py-2 text-left text-sm font-medium ${
                          isCompleted
                            ? 'text-secondary bg-green-500'
                            : 'text-muted-foreground'
                        }`}
                      >
                        <CheckCircle2
                          className={`mr-2 h-5 w-5 ${
                            isCompleted
                              ? 'fill-secondary text-green-600'
                              : 'text-muted-foreground'
                          } ${pending ? 'animate-pulse' : ''}`}
                        />
                        <p>{isCompleted ? 'Done' : 'Mark as done'}</p>
                      </button>
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
