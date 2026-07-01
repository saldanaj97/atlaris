import type { ActivityItem } from '../types';
import type { PlanSummary } from '@/shared/types/db.types';

import { Surface } from '@/components/ui/surface';
import { formatMinutes } from '@/features/plans/formatters';
import { Activity, CheckCircle2, Clock3, ListChecks } from 'lucide-react';

type ActivityFeedScoreboardProps = {
  summaries: PlanSummary[];
  activities: ActivityItem[];
  activePlan?: PlanSummary;
};

const COMPLETION_EPSILON = 1e-6;

export function ActivityFeedScoreboard({
  summaries,
  activities,
  activePlan,
}: ActivityFeedScoreboardProps) {
  const totalTasks = summaries.reduce(
    (count, summary) => count + summary.totalTasks,
    0,
  );
  const completedTasks = summaries.reduce(
    (count, summary) => count + summary.completedTasks,
    0,
  );
  const completedMinutes = summaries.reduce(
    (minutes, summary) => minutes + summary.completedMinutes,
    0,
  );
  const inProgressPlanCount = summaries.filter(
    (summary) => summary.completion < 1 - COMPLETION_EPSILON,
  ).length;
  const completedPlanCount = summaries.length - inProgressPlanCount;
  const taskCompletionPercent =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const activePlanProgress = activePlan
    ? Math.round(Math.max(0, Math.min(1, activePlan.completion)) * 100)
    : null;
  const metrics = [
    {
      label: 'In-progress plans',
      value: inProgressPlanCount.toString(),
      detail:
        completedPlanCount > 0
          ? `${completedPlanCount} completed`
          : 'No completions yet',
      icon: ListChecks,
    },
    {
      label: 'Task progress',
      value: `${taskCompletionPercent}%`,
      detail:
        totalTasks > 0
          ? `${completedTasks} / ${totalTasks} complete`
          : 'No tracked tasks',
      icon: CheckCircle2,
    },
    {
      label: 'Completed time',
      value: formatMinutes(completedMinutes),
      detail: activePlan
        ? `${activePlanProgress}% current plan`
        : 'No active plan',
      icon: Clock3,
    },
    {
      label: 'Feed events',
      value: activities.length.toString(),
      detail:
        activities.length === 0
          ? 'No recent signals'
          : activities.length === 1
            ? '1 recent signal'
            : 'Recent learning signals',
      icon: Activity,
    },
  ];

  return (
    <section aria-label='Activity pulse' className='space-y-6'>
      <div className='flex items-center gap-2 border-b border-border pb-4'>
        <p className='px-2 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground'>
          Activity pulse
        </p>
      </div>

      <Surface
        aria-label='Activity feed scoreboard'
        padding='comfortable'
        className='border-primary/20'
      >
        <div className='grid gap-3'>
          {metrics.map((metric) => {
            const Icon = metric.icon;

            return (
              <div
                key={metric.label}
                className='rounded-xl border border-panel-border bg-panel-muted/70 p-4'
              >
                <div className='mb-3 flex items-center gap-2 text-muted-foreground'>
                  <Icon className='size-4 text-primary' aria-hidden='true' />
                  <p className='text-xs font-medium tracking-wide uppercase'>
                    {metric.label}
                  </p>
                </div>
                <p className='text-2xl font-semibold text-foreground tabular-nums'>
                  {metric.value}
                </p>
                <p className='mt-1 text-sm text-muted-foreground'>
                  {metric.detail}
                </p>
              </div>
            );
          })}
        </div>
      </Surface>
    </section>
  );
}
