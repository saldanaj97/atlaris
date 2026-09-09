'use client';

import type { UsageAnalyticsModel } from './usage-analytics-model';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  CompletionAreaChart,
  DailyActivityBarChart,
  TimeByPlanDonut,
  WeeklyLineChart,
} from './usage-analytics-charts';
import {
  activityEventTitle,
  formatCompactDuration,
  remainingLabel,
  streakComparison,
} from './usage-analytics-formatters';
import { PageHero } from '@/components/ui/page-hero';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';
import { ROUTES } from '@/features/navigation/routes';
import { formatRelativePast } from '@/lib/date/relative-time';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  Hexagon,
  Play,
  Target,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

const LEARNING_ACTIVITY_TITLE_ID = 'usage-learning-activity-title';
const LEARNING_ACTIVITY_DESCRIPTION_ID = 'usage-learning-activity-description';
const LEARNING_ACTIVITY_SUMMARY_ID = 'usage-learning-activity-summary';
const TIME_BY_PLAN_TITLE_ID = 'usage-time-by-plan-title';
const TIME_BY_PLAN_DESCRIPTION_ID = 'usage-time-by-plan-description';
const TIME_BY_PLAN_SUMMARY_ID = 'usage-time-by-plan-summary';
const COMPLETION_TITLE_ID = 'usage-completion-title';
const COMPLETION_DESCRIPTION_ID = 'usage-completion-description';
const COMPLETION_SUMMARY_ID = 'usage-completion-summary';
const RECENT_ACTIVITY_TITLE_ID = 'usage-recent-activity-title';

type ActivityChartMetric = 'time' | 'changes' | 'by-plan';
type CompletionChartMode = 'cumulative' | 'weekly';

/** Renders the usage analytics page with current completion and activity history. */
export function UsageAnalyticsContent({
  model,
}: {
  model: UsageAnalyticsModel;
}) {
  const [activityMetric, setActivityMetric] =
    useState<ActivityChartMetric>('time');
  const [completionMode, setCompletionMode] =
    useState<CompletionChartMode>('cumulative');

  return (
    <div className='space-y-6'>
      <AnalyticsHero />

      <section
        aria-label='Learning summary'
        className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
      >
        <MetricTile
          label='Modules completed'
          value={model.completedModules.toString()}
          icon={BookOpen}
          iconClassName='text-primary'
          detail={
            model.totalModules > 0
              ? `${model.completedModules} of ${model.totalModules} modules · ${model.completedTasks} of ${model.totalTasks} tasks`
              : 'No modules tracked yet'
          }
          comparison={
            model.totalModules > 0
              ? remainingLabel(
                  model.totalModules - model.completedModules,
                  'module',
                )
              : 'Create a plan to track modules'
          }
        />
        <MetricTile
          label='Time spent learning'
          value={formatCompactDuration(model.completedMinutes)}
          icon={Clock}
          iconClassName='text-chart-2'
          detail='Estimated completed learning time'
          comparison={
            model.totalMinutes > 0
              ? `${formatCompactDuration(model.totalMinutes)} planned total`
              : 'No estimated time yet'
          }
        />
        <MetricTile
          label='Plans in progress'
          value={model.plansInProgress.toString()}
          icon={BarChart3}
          iconClassName='text-primary'
          detail={
            model.plans.length > 0
              ? `${model.plans.length} ${model.plans.length === 1 ? 'plan' : 'plans'} in your library`
              : 'No plans yet'
          }
          comparison={
            model.plansInProgress > 0
              ? 'Plans with unfinished tasks'
              : model.plans.length > 0
                ? 'Every plan is complete'
                : 'Start a plan to track progress'
          }
        />
        <MetricTile
          label='Current streak'
          value={
            model.history.currentStreakDays === 1
              ? '1 day'
              : `${model.history.currentStreakDays} days`
          }
          icon={Target}
          iconClassName='text-primary'
          detail={`Best ${model.history.longestStreakDays === 1 ? '1 day' : `${model.history.longestStreakDays} days`}`}
          comparison={streakComparison(
            model.history.currentStreakDays,
            model.history.longestStreakDays,
          )}
        />
      </section>

      <div className='grid gap-4 lg:grid-cols-2'>
        <ChartPanel
          titleId={LEARNING_ACTIVITY_TITLE_ID}
          title='Learning activity'
          descriptionId={LEARNING_ACTIVITY_DESCRIPTION_ID}
          description={
            activityMetric === 'by-plan'
              ? 'Progress changes by plan and week.'
              : activityMetric === 'time'
                ? 'Estimated completed time recorded each day.'
                : 'Progress changes recorded each day.'
          }
          control={
            <Select
              value={activityMetric}
              onValueChange={(value) =>
                setActivityMetric(value as ActivityChartMetric)
              }
            >
              <SelectTrigger
                size='sm'
                aria-label='Learning activity metric'
                className='min-w-36'
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align='end'>
                <SelectItem value='time'>Time spent</SelectItem>
                <SelectItem value='changes'>Progress changes</SelectItem>
                <SelectItem value='by-plan'>By plan</SelectItem>
              </SelectContent>
            </Select>
          }
        >
          <p id={LEARNING_ACTIVITY_SUMMARY_ID} className='sr-only'>
            {activityMetric === 'by-plan'
              ? 'Line chart showing progress changes by week for each plan. Values come from recorded task status changes.'
              : activityMetric === 'time'
                ? 'Bar chart showing estimated completed learning time added each day from recorded completions.'
                : 'Bar chart showing recorded progress changes each day.'}
          </p>
          {activityMetric === 'by-plan' ? (
            <WeeklyLineChart
              weeks={model.history.weeklyTrends}
              plans={model.plans}
              labelledBy={LEARNING_ACTIVITY_TITLE_ID}
              describedBy={`${LEARNING_ACTIVITY_DESCRIPTION_ID} ${LEARNING_ACTIVITY_SUMMARY_ID}`}
            />
          ) : (
            <DailyActivityBarChart
              days={model.history.dailyTrends}
              metric={activityMetric}
              labelledBy={LEARNING_ACTIVITY_TITLE_ID}
              describedBy={`${LEARNING_ACTIVITY_DESCRIPTION_ID} ${LEARNING_ACTIVITY_SUMMARY_ID}`}
            />
          )}
          <p className='mt-4 border-t border-border/60 pt-4 text-sm text-muted-foreground'>
            {!model.plans.length
              ? 'No plans yet. Activity appears when a plan records progress.'
              : !model.history.hasActivity
                ? 'No progress changes have been recorded in this window. Complete a task to start your history.'
                : 'History reflects progress changes recorded in your analytics timezone.'}
          </p>
        </ChartPanel>

        <ChartPanel
          titleId={TIME_BY_PLAN_TITLE_ID}
          title='Time by plan'
          descriptionId={TIME_BY_PLAN_DESCRIPTION_ID}
          description='Where estimated completed time is concentrated.'
        >
          <p id={TIME_BY_PLAN_SUMMARY_ID} className='sr-only'>
            Donut chart of estimated completed learning time by plan, using
            current completion state rather than a study timer.
          </p>
          <TimeByPlanDonut
            shares={model.planTimeShares}
            totalMinutes={model.completedMinutes}
            labelledBy={TIME_BY_PLAN_TITLE_ID}
            describedBy={`${TIME_BY_PLAN_DESCRIPTION_ID} ${TIME_BY_PLAN_SUMMARY_ID}`}
          />
        </ChartPanel>

        <ChartPanel
          titleId={COMPLETION_TITLE_ID}
          title='Completed events'
          descriptionId={COMPLETION_DESCRIPTION_ID}
          description='Recorded completions over the eight-week pulse.'
          control={
            <Select
              value={completionMode}
              onValueChange={(value) =>
                setCompletionMode(value as CompletionChartMode)
              }
            >
              <SelectTrigger
                size='sm'
                aria-label='Completed events chart mode'
                className='min-w-36'
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align='end'>
                <SelectItem value='cumulative'>Cumulative</SelectItem>
                <SelectItem value='weekly'>Weekly</SelectItem>
              </SelectContent>
            </Select>
          }
        >
          <p id={COMPLETION_SUMMARY_ID} className='sr-only'>
            Area chart of completed-status events from learning activity
            history. This is not a reconstructed module-completion timeline.
          </p>
          <CompletionAreaChart
            weeks={model.history.weeklyTrends}
            mode={completionMode}
            labelledBy={COMPLETION_TITLE_ID}
            describedBy={`${COMPLETION_DESCRIPTION_ID} ${COMPLETION_SUMMARY_ID}`}
          />
        </ChartPanel>

        <RecentActivityPanel model={model} />
      </div>
    </div>
  );
}

/** Decorative page introduction with planetary-horizon artwork. */
function AnalyticsHero() {
  return (
    <PageHero
      className='rounded-[12px] border border-panel-border bg-panel shadow-sm'
      contentClassName='relative flex min-h-[18rem] flex-col justify-center px-5 py-8 sm:min-h-[20rem] sm:px-8 sm:py-10 lg:px-10'
      overline='Analytics'
      overlineIcon={<Hexagon aria-hidden='true' className='size-4' />}
      overlineClassName='tracking-[0.18em] text-muted-foreground'
      title={
        <>
          Learning <span className='text-primary'>analytics</span>
        </>
      }
      titleClassName='font-heading mt-3 max-w-xl text-[32px] leading-[1.1] tracking-[-0.03em] text-balance text-foreground sm:text-[42px]'
      description='A clear view of your progress, habits, and learning journey.'
      descriptionClassName='mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base'
    >
      <p
        aria-hidden='true'
        className='pointer-events-none absolute top-1/2 right-5 hidden -translate-y-1/2 text-[10px] font-semibold tracking-[0.22em] text-muted-foreground uppercase [writing-mode:vertical-rl] lg:block'
      >
        Discipline today. Opportunity tomorrow.
      </p>
    </PageHero>
  );
}

function ChartPanel({
  titleId,
  title,
  descriptionId,
  description,
  control,
  children,
}: {
  titleId: string;
  title: string;
  descriptionId: string;
  description: string;
  control?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Surface padding='none' className='flex min-h-0 flex-col overflow-hidden'>
      <div className='flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6'>
        <div className='min-w-0'>
          <h2
            id={titleId}
            className='text-lg font-semibold text-foreground sm:text-xl'
          >
            {title}
          </h2>
          <p id={descriptionId} className='mt-1 text-sm text-muted-foreground'>
            {description}
          </p>
        </div>
        {control ? <div className='shrink-0'>{control}</div> : null}
      </div>
      <div className='px-5 pb-5 sm:px-6'>{children}</div>
    </Surface>
  );
}

type MetricTileProps = {
  label: string;
  value: string;
  detail: string;
  comparison: string;
  icon: LucideIcon;
  iconClassName?: string;
};

/** Renders one summary metric with an icon tile and honest supporting copy. */
function MetricTile({
  label,
  value,
  detail,
  comparison,
  icon: Icon,
  iconClassName,
}: MetricTileProps) {
  return (
    <Surface padding='none' className='flex min-h-36 flex-col p-5'>
      <div className='flex items-start gap-3'>
        <span
          className='flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10'
          aria-hidden='true'
        >
          <Icon className={cn('size-4', iconClassName ?? 'text-primary')} />
        </span>
        <div className='min-w-0'>
          <p className='text-sm text-muted-foreground'>{label}</p>
          <p className='mt-1 text-3xl font-semibold text-foreground tabular-nums'>
            {value}
          </p>
        </div>
      </div>
      <p className='mt-4 text-sm text-muted-foreground'>{detail}</p>
      <p className='mt-auto pt-3 text-xs text-muted-foreground'>{comparison}</p>
    </Surface>
  );
}

function RecentActivityPanel({ model }: { model: UsageAnalyticsModel }) {
  return (
    <Surface padding='none' className='flex min-h-0 flex-col overflow-hidden'>
      <div className='flex items-start justify-between gap-4 px-5 py-5 sm:px-6'>
        <div className='min-w-0'>
          <h2
            id={RECENT_ACTIVITY_TITLE_ID}
            className='text-lg font-semibold text-foreground sm:text-xl'
          >
            Recent activity
          </h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            Your latest recorded progress changes.
          </p>
        </div>
        <Link
          href={ROUTES.DASHBOARD}
          className='shrink-0 text-sm font-medium text-primary hover:underline'
        >
          View all
        </Link>
      </div>
      {model.recentEvents.length === 0 ? (
        <p className='px-5 pb-5 text-sm text-muted-foreground sm:px-6'>
          {model.history.hasActivity
            ? 'No recent events to list.'
            : 'Complete a task to start your activity history.'}
        </p>
      ) : (
        <ul className='divide-y divide-border/50'>
          {model.recentEvents.map((event) => (
            <li key={event.id}>
              <Link
                href={`${ROUTES.PLANS.ROOT}/${event.planId}`}
                className='grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 hover:bg-panel-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset sm:px-6'
              >
                <RecentActivityIcon status={event.status} />
                <div className='min-w-0'>
                  <p className='truncate text-sm font-medium text-foreground'>
                    {activityEventTitle(event.status)}
                  </p>
                  <p className='mt-0.5 truncate text-sm text-muted-foreground'>
                    {event.planTopic}
                  </p>
                </div>
                <time
                  dateTime={event.occurredAt.toISOString()}
                  className='shrink-0 text-xs text-muted-foreground tabular-nums'
                >
                  {formatRelativePast(event.occurredAt, {
                    referenceDate: new Date(),
                    style: 'compact',
                  })}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}

function RecentActivityIcon({
  status,
}: {
  status: UsageAnalyticsModel['recentEvents'][number]['status'];
}) {
  switch (status) {
    case 'completed':
      return (
        <span
          className='flex size-9 shrink-0 items-center justify-center rounded-full border border-success/30 bg-success/10 text-success'
          aria-hidden='true'
        >
          <CheckCircle2 className='size-4' />
        </span>
      );
    case 'in_progress':
      return (
        <span
          className='flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary'
          aria-hidden='true'
        >
          <Play className='size-4' />
        </span>
      );
    case 'not_started':
      return (
        <span
          className='flex size-9 shrink-0 items-center justify-center rounded-full border border-chart-2/30 bg-chart-2/10 text-chart-2'
          aria-hidden='true'
        >
          <Clock className='size-4' />
        </span>
      );
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

/** Loading skeleton that mirrors the analytics page hierarchy while data streams in. */
export function UsageAnalyticsContentSkeleton() {
  return (
    <section
      aria-label='Loading usage analytics'
      aria-busy='true'
      className='space-y-6'
    >
      <div className='rounded-[12px] border border-panel-border bg-panel p-5 sm:min-h-[20rem] sm:p-8'>
        <Skeleton className='h-4 w-28 bg-secondary' />
        <Skeleton className='mt-5 h-10 w-full max-w-md' />
        <Skeleton className='mt-3 h-4 w-full max-w-xl bg-muted' />
      </div>

      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        {[1, 2, 3, 4].map((id) => (
          <MetricTileSkeleton key={`usage-summary-skeleton-${id}`} />
        ))}
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        {[1, 2, 3, 4].map((id) => (
          <div
            key={`usage-panel-skeleton-${id}`}
            className='rounded-[12px] border border-panel-border bg-panel p-5 sm:p-6'
          >
            <Skeleton className='h-6 w-40' />
            <Skeleton className='mt-2 h-4 w-56 bg-muted' />
            <Skeleton className='mt-6 h-64 w-full bg-secondary' />
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricTileSkeleton() {
  return (
    <div className='min-h-36 rounded-[12px] border border-panel-border bg-panel p-5'>
      <div className='flex items-start gap-3'>
        <Skeleton className='size-10 rounded-full bg-secondary' />
        <div className='min-w-0 flex-1'>
          <Skeleton className='h-4 w-28 bg-muted' />
          <Skeleton className='mt-2 h-8 w-20' />
        </div>
      </div>
      <Skeleton className='mt-4 h-4 w-36 bg-muted' />
    </div>
  );
}
