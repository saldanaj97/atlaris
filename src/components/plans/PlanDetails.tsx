'use client';

import { useRouter } from 'next/navigation';
import type { ElementType } from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { updateTaskProgress } from '@/lib/api/plans';
import type { ClientPlanDetail, ClientTask } from '@/lib/types/client';
import type { ProgressStatus, ResourceType } from '@/lib/types/db';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  formatLearningStyle,
  formatMinutes,
  formatSkillLevel,
} from '@/lib/formatters';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  PlayCircle,
  Target,
} from 'lucide-react';

interface PlanDetailClientProps {
  plan: ClientPlanDetail;
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

export default function PlanDetails({ plan }: PlanDetailClientProps) {
  const router = useRouter();
  const totalTasks = useMemo(
    () =>
      plan.modules.reduce((count, module) => count + module.tasks.length, 0),
    [plan.modules]
  );

  const [statuses, setStatuses] = useState<Record<string, ProgressStatus>>(
    () => {
      const entries = plan.modules.flatMap((module) =>
        module.tasks.map((task) => [task.id, task.status] as const)
      );
      return Object.fromEntries(entries);
    }
  );

  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

  const completedTasks = useMemo(
    () =>
      Object.values(statuses).filter((status) => status === 'completed').length,
    [statuses]
  );

  const completion = totalTasks
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0;

  const totalMinutes = useMemo(
    () =>
      plan.modules.reduce(
        (sum, module) =>
          sum +
          module.tasks.reduce(
            (moduleSum, task) => moduleSum + task.estimatedMinutes,
            0
          ),
        0
      ),
    [plan.modules]
  );

  const estimatedWeeks = plan.weeklyHours
    ? Math.ceil(totalMinutes / (plan.weeklyHours * 60))
    : null;

  const toggleTask = async (task: ClientTask) => {
    const current = statuses[task.id] ?? 'not_started';
    const next: ProgressStatus =
      current === 'completed' ? 'not_started' : 'completed';

    setPendingTaskId(task.id);
    try {
      await updateTaskProgress(plan.id, task.id, next);
      setStatuses((prev) => ({ ...prev, [task.id]: next }));
      toast.success(
        next === 'completed'
          ? 'Marked task as complete.'
          : 'Marked task as not started.'
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

  const handleExport = (type: 'notion' | 'calendar' | 'csv') => {
    toast.info(`Export to ${type.toUpperCase()} is coming soon.`);
  };

  // TODO: Add way to regenerate the plan or regenerate a module
  return (
    <div className="bg-gradient-subtle min-h-screen">
      <div className="container mx-auto max-w-6xl px-6 py-8">
        <Button
          variant="ghost"
          onClick={() => router.push('/plans')}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Your Plans
        </Button>

        <Card className="bg-gradient-card border-0 p-8 shadow-lg">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-4 md:col-span-2">
              <div className="space-y-1">
                <Badge variant="secondary" className="uppercase">
                  {formatSkillLevel(plan.skillLevel)}
                </Badge>
                <h1 className="text-3xl font-bold">{plan.topic}</h1>
              </div>

              <p className="text-muted-foreground">
                Tailored for {formatSkillLevel(plan.skillLevel)} learners with a
                focus on {formatLearningStyle(plan.learningStyle)} activities.
                Commit {plan.weeklyHours} hour
                {plan.weeklyHours === 1 ? '' : 's'}
                per week to stay on track.
              </p>

              <div className="text-muted-foreground flex flex-wrap gap-4 text-sm">
                <span>
                  Visibility: <strong>{plan.visibility}</strong>
                </span>
                <span>
                  Origin: <strong>{plan.origin}</strong>
                </span>
                {plan.createdAt ? (
                  <span>
                    Created {new Date(plan.createdAt).toLocaleDateString()}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-primary/5 rounded-lg p-4 text-center">
                <div className="text-primary text-2xl font-bold">
                  {completion}%
                </div>
                <div className="text-muted-foreground text-sm">Complete</div>
                <Progress value={completion} className="mt-2" />
              </div>

              <div className="grid grid-cols-2 gap-4 text-center text-sm">
                <div>
                  <div className="text-lg font-semibold">{completedTasks}</div>
                  <div className="text-muted-foreground">Completed Tasks</div>
                </div>
                <div>
                  <div className="text-lg font-semibold">{totalTasks}</div>
                  <div className="text-muted-foreground">Total Tasks</div>
                </div>
                <div>
                  <div className="text-lg font-semibold">
                    {formatMinutes(totalMinutes)}
                  </div>
                  <div className="text-muted-foreground">Total Effort</div>
                </div>
                <div>
                  <div className="text-lg font-semibold">
                    {estimatedWeeks
                      ? `${estimatedWeeks} week${estimatedWeeks === 1 ? '' : 's'}`
                      : '—'}
                  </div>
                  <div className="text-muted-foreground">
                    Estimated Duration
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="mt-6 mb-8 grid gap-4 md:grid-cols-3">
          <Button onClick={() => handleExport('notion')}>
            <Download className="mr-2 h-4 w-4" />
            Export to Notion
          </Button>
          <Button variant="outline" onClick={() => handleExport('calendar')}>
            <Calendar className="mr-2 h-4 w-4" />
            Add to Calendar
          </Button>
          <Button variant="outline" onClick={() => handleExport('csv')}>
            <FileText className="mr-2 h-4 w-4" />
            Download CSV
          </Button>
        </div>

        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Learning Modules</h2>
          {plan.modules.length === 0 ? (
            <Card className="text-muted-foreground p-6 text-center">
              No modules yet. Generation will populate this plan soon.
            </Card>
          ) : (
            plan.modules.map((module) => (
              <Card key={module.id} className="border-0 p-6 shadow-sm">
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
                  {module.tasks.map((task) => {
                    const status = statuses[task.id] ?? 'not_started';
                    const isCompleted = status === 'completed';
                    const pending = pendingTaskId === task.id;

                    return (
                      <div
                        key={task.id}
                        className="hover:border-primary/30 rounded-lg border p-4 transition-colors"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={() => void toggleTask(task)}
                              disabled={pending}
                              aria-pressed={isCompleted}
                              className={`flex items-center text-left text-sm font-medium ${
                                isCompleted
                                  ? 'text-green-600'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              <CheckCircle2
                                className={`mr-2 h-5 w-5 ${
                                  isCompleted
                                    ? 'fill-current text-green-600'
                                    : 'text-muted-foreground'
                                } ${pending ? 'animate-pulse' : ''}`}
                              />
                              {task.title}
                            </button>
                            {task.description ? (
                              <p className="text-muted-foreground text-sm">
                                {task.description}
                              </p>
                            ) : null}
                            <div className="text-muted-foreground text-xs">
                              Effort: {formatMinutes(task.estimatedMinutes)}
                            </div>
                          </div>
                          <div className="text-muted-foreground text-xs uppercase">
                            Status: {isCompleted ? 'Completed' : 'Not started'}
                          </div>
                        </div>

                        {task.resources.length ? (
                          <div className="mt-4 space-y-2">
                            <div className="text-muted-foreground text-xs font-semibold uppercase">
                              Recommended Resources
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              {task.resources.map((resource) => {
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
                                            {formatMinutes(
                                              resource.durationMinutes
                                            )}
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
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
