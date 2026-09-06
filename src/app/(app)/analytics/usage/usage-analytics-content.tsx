'use client';

import type { UsageAnalyticsModel } from './usage-analytics-model';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { WeeklyLineChart } from './usage-analytics-charts';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ResponsiveBackdrop } from '@/components/ui/responsive-backdrop';
import { SectionOverline } from '@/components/ui/section-overline';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';
import { formatMinutes } from '@/features/plans/formatters';
import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  Flame,
  Minus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

const EIGHT_WEEK_PULSE_TITLE_ID = 'usage-eight-week-pulse-title';
const EIGHT_WEEK_PULSE_DESCRIPTION_ID = 'usage-eight-week-pulse-description';
const EIGHT_WEEK_PULSE_SUMMARY_ID = 'usage-eight-week-pulse-summary';

/** Renders the usage analytics page with current completion and activity history. */
export function UsageAnalyticsContent({
  model,
}: {
  model: UsageAnalyticsModel;
}) {
  const currentWeek = model.history.currentWeek;
  const previousWeek = model.history.weeklyTrends.at(-2) ?? null;
  const completionCards = [
    {
      label: 'Tasks',
      value: `${model.taskCompletionPercent}%`,
      detail:
        model.totalTasks > 0
          ? `${model.completedTasks} of ${model.totalTasks} tasks complete`
          : 'No tasks tracked yet',
      comparison:
        model.totalTasks > 0
          ? remainingLabel(model.totalTasks - model.completedTasks, 'task')
          : 'Create a plan to track tasks',
      icon: CheckCircle2,
      progress: model.totalTasks > 0 ? model.taskCompletionPercent : undefined,
    },
    {
      label: 'Modules',
      value: `${model.moduleCompletionPercent}%`,
      detail:
        model.totalModules > 0
          ? `${model.completedModules} of ${model.totalModules} modules complete`
          : 'No modules tracked yet',
      comparison:
        model.totalModules > 0
          ? remainingLabel(
              model.totalModules - model.completedModules,
              'module',
            )
          : 'Create a plan to track modules',
      icon: BookOpen,
      progress:
        model.totalModules > 0 ? model.moduleCompletionPercent : undefined,
    },
    {
      label: 'Completed time',
      value: formatMinutes(model.completedMinutes),
      detail: 'Estimated completed learning time',
      comparison:
        model.totalMinutes > 0
          ? `${formatMinutes(model.totalMinutes)} planned total`
          : 'No estimated time yet',
      icon: Clock,
      progress:
        model.totalMinutes > 0
          ? Math.min(100, (model.completedMinutes / model.totalMinutes) * 100)
          : undefined,
    },
  ] as const;

  const activityCards = [
    {
      label: 'Progress changes',
      value: currentWeek.progressChangeCount.toString(),
      detail: currentWeek.activeDays
        ? `Across ${formatDayCount(currentWeek.activeDays).toLowerCase()}`
        : 'No changes recorded this week',
      comparison: formatCountDelta(
        currentWeek.progressChangeCount,
        previousWeek?.progressChangeCount ?? 0,
        'change',
      ),
      status: activityStatus(
        currentWeek.progressChangeCount,
        previousWeek?.progressChangeCount ?? 0,
      ),
      icon: Activity,
    },
    {
      label: 'Completed events',
      value: currentWeek.completedEvents.toString(),
      detail: currentWeek.completedEvents
        ? `${formatMinutes(currentWeek.estimatedCompletionAddedMinutes)} estimated time added`
        : 'No completed events this week',
      comparison: formatCountDelta(
        currentWeek.completedEvents,
        previousWeek?.completedEvents ?? 0,
        'event',
      ),
      status: activityStatus(
        currentWeek.completedEvents,
        previousWeek?.completedEvents ?? 0,
      ),
      icon: CheckCircle2,
    },
    {
      label: 'Active days',
      value: `${currentWeek.activeDays}/7`,
      detail: currentWeek.progressChangeCount
        ? `${currentWeek.progressChangeCount} changes logged`
        : 'No activity logged this week',
      comparison: formatCountDelta(
        currentWeek.activeDays,
        previousWeek?.activeDays ?? 0,
        'day',
      ),
      status: activityStatus(
        currentWeek.activeDays,
        previousWeek?.activeDays ?? 0,
      ),
      icon: CalendarDays,
    },
    {
      label: 'Streak',
      value: formatDayCount(model.history.currentStreakDays),
      detail: `Best ${formatDayCount(model.history.longestStreakDays)}`,
      comparison: streakComparison(
        model.history.currentStreakDays,
        model.history.longestStreakDays,
      ),
      icon: Flame,
    },
  ] as const;

  return (
    <div className='space-y-8'>
      <AnalyticsHero />

      <section aria-labelledby='usage-completion-heading' className='space-y-4'>
        <SectionHeading
          eyebrow='Overview'
          id='usage-completion-heading'
          title='Current completion'
          description='Progress across every plan, based on the tasks and modules you have completed.'
          aside='All plans'
        />
        <div className='grid gap-4 md:grid-cols-3'>
          {completionCards.map((card) => (
            <MetricTile key={card.label} {...card} />
          ))}
        </div>
      </section>

      <section aria-labelledby='usage-activity-heading' className='space-y-4'>
        <SectionHeading
          eyebrow='Activity'
          id='usage-activity-heading'
          title='Learning activity'
          description='Recorded progress changes and streaks in your analytics timezone.'
          aside={
            <Badge variant='product'>This week · {currentWeek.label}</Badge>
          }
        />
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {activityCards.map((card) => (
            <MetricTile key={card.label} {...card} />
          ))}
        </div>
      </section>

      <section aria-labelledby={EIGHT_WEEK_PULSE_TITLE_ID}>
        <Surface padding='none' className='overflow-hidden'>
          <div className='flex flex-col gap-4 border-b border-border/60 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6'>
            <div className='min-w-0'>
              <p className='text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase'>
                Trend
              </p>
              <h2
                id={EIGHT_WEEK_PULSE_TITLE_ID}
                className='mt-1 text-xl font-semibold text-foreground'
              >
                Eight-week pulse
              </h2>
              <p
                id={EIGHT_WEEK_PULSE_DESCRIPTION_ID}
                className='mt-1 text-sm text-muted-foreground'
              >
                Progress changes by plan and week.
              </p>
            </div>
            <Badge variant='product' className='self-start'>
              Monday-start weeks
            </Badge>
          </div>

          <div className='px-5 pt-5 sm:px-6'>
            <p id={EIGHT_WEEK_PULSE_SUMMARY_ID} className='sr-only'>
              Line chart showing progress changes by week for each plan. Values
              come from recorded task status changes.
            </p>
            <WeeklyLineChart
              weeks={model.history.weeklyTrends}
              plans={model.plans}
              labelledBy={EIGHT_WEEK_PULSE_TITLE_ID}
              describedBy={`${EIGHT_WEEK_PULSE_DESCRIPTION_ID} ${EIGHT_WEEK_PULSE_SUMMARY_ID}`}
            />
          </div>

          <div className='px-5 pb-5 sm:px-6'>
            <p className='border-t border-border/60 pt-4 text-sm text-muted-foreground'>
              {!model.plans.length
                ? 'No plans yet. The pulse will appear when a plan records progress.'
                : !model.history.hasActivity
                  ? 'No progress changes have been recorded in this eight-week window. Complete a task to start your history.'
                  : 'History reflects progress changes recorded in your analytics timezone.'}
            </p>
          </div>
        </Surface>
      </section>
    </div>
  );
}

/** Decorative page introduction with responsive artwork that stays out of the reading path. */
function AnalyticsHero() {
  return (
    <header className='relative isolate overflow-hidden rounded-2xl border border-panel-border bg-panel px-5 py-6 sm:px-7 sm:py-8'>
      <ResponsiveBackdrop
        desktop={{
          src: '/artwork/planetary-horizon-desktop.jpg',
          objectPosition: '78% 50%',
          className: 'opacity-80',
        }}
        mobile={{
          src: '/artwork/planetary-horizon-mobile.jpg',
          objectPosition: '68% 42%',
          className: 'opacity-75',
        }}
      />

      <div className='relative max-w-2xl'>
        <SectionOverline
          icon={<BarChart3 aria-hidden='true' className='size-4' />}
        >
          Analytics
        </SectionOverline>
        <h1 className='font-heading mt-3 text-[32px] leading-[1.15] tracking-[-0.03em] text-balance text-foreground sm:text-[40px]'>
          Learning <span className='text-primary'>analytics</span>
        </h1>
        <p className='mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base'>
          Current completion progress, weekly progress changes, and estimated
          completed learning time from your plans.
        </p>
      </div>
    </header>
  );
}

function SectionHeading({
  eyebrow,
  id,
  title,
  description,
  aside,
}: {
  eyebrow: string;
  id: string;
  title: string;
  description: string;
  aside: ReactNode;
}) {
  return (
    <div className='flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
      <div className='min-w-0'>
        <SectionOverline className='tracking-[0.14em] text-muted-foreground'>
          {eyebrow}
        </SectionOverline>
        <h2 id={id} className='mt-1 text-xl font-semibold text-foreground'>
          {title}
        </h2>
        <p className='mt-1 max-w-2xl text-sm text-muted-foreground'>
          {description}
        </p>
      </div>
      {typeof aside === 'string' ? (
        <p className='shrink-0 text-sm text-muted-foreground'>{aside}</p>
      ) : (
        aside
      )}
    </div>
  );
}

type MetricTrend = {
  label: 'Up' | 'Down' | 'Flat';
  icon: 'up' | 'down' | 'flat';
};

type MetricTileProps = {
  label: string;
  value: string;
  detail: string;
  comparison: string;
  icon: LucideIcon;
  status?: MetricTrend | null;
  progress?: number;
};

/** Renders one metric with its actual scope, optional completion bar, and comparison. */
function MetricTile({
  label,
  value,
  detail,
  comparison,
  icon: Icon,
  status,
  progress,
}: MetricTileProps) {
  return (
    <Surface padding='none' className='flex min-h-44 flex-col p-5 sm:p-6'>
      <div className='flex items-start justify-between gap-3'>
        <span
          className='flex size-11 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary'
          aria-hidden='true'
        >
          <Icon className='size-5' />
        </span>
        {status ? (
          <span aria-label={status.label} className='inline-flex'>
            <TrendStatusIcon kind={status.icon} />
          </span>
        ) : null}
      </div>

      <p className='mt-5 text-sm text-muted-foreground'>{label}</p>
      <p className='mt-1 text-3xl font-semibold text-foreground tabular-nums'>
        {value}
      </p>
      <p className='mt-2 text-sm text-muted-foreground'>{detail}</p>

      {progress !== undefined ? (
        <Progress
          value={progress}
          max={100}
          aria-label={`${label} completion`}
          className='mt-5 h-1.5'
        />
      ) : null}

      <p className='mt-auto pt-4 text-xs text-muted-foreground'>{comparison}</p>
    </Surface>
  );
}

const TREND_ICON_CLASSNAME: Record<MetricTrend['icon'], string> = {
  up: 'size-5 text-success',
  down: 'size-5 text-destructive',
  flat: 'size-5 text-primary',
};

const TREND_ICON = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
} as const;

/** Renders the up, down, or flat trend icon for a metric status. */
function TrendStatusIcon({ kind }: { kind: MetricTrend['icon'] }) {
  const Icon = TREND_ICON[kind];
  return <Icon aria-hidden='true' className={TREND_ICON_CLASSNAME[kind]} />;
}

/** Formats a day count with correct singular or plural labeling. */
function formatDayCount(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** Returns a human-readable label for remaining tasks or modules. */
function remainingLabel(remaining: number, noun: string): string {
  const safeRemaining = Math.max(0, remaining);

  if (safeRemaining === 0) {
    return 'Nothing left';
  }

  return `${safeRemaining} ${safeRemaining === 1 ? noun : `${noun}s`} left`;
}

/** Compares current and previous values to produce a visible trend. */
function activityStatus(current: number, previous: number): MetricTrend | null {
  if (current === 0 && previous === 0) {
    return null;
  }

  if (current > previous) {
    return { label: 'Up', icon: 'up' };
  }

  if (current < previous) {
    return { label: 'Down', icon: 'down' };
  }

  return { label: 'Flat', icon: 'flat' };
}

/** Formats a week-over-week delta for counts such as changes, events, or days. */
function formatCountDelta(
  current: number,
  previous: number,
  noun: 'change' | 'event' | 'day',
): string {
  const delta = current - previous;

  if (delta === 0) {
    return 'No change vs last week';
  }

  const absoluteDelta = Math.abs(delta);
  const unit = absoluteDelta === 1 ? noun : `${noun}s`;

  return `${delta > 0 ? '+' : '-'}${absoluteDelta} ${unit} vs last week`;
}

/** Returns comparison copy describing distance from the user's best streak. */
function streakComparison(current: number, longest: number): string {
  if (current === 0 && longest === 0) {
    return 'Start with one active day';
  }

  if (current >= longest) {
    return 'Matches your best run';
  }

  const remaining = longest - current;
  return `${remaining} ${remaining === 1 ? 'day' : 'days'} from best`;
}

/** Loading skeleton that mirrors the analytics page hierarchy while data streams in. */
export function UsageAnalyticsContentSkeleton() {
  return (
    <section
      aria-label='Loading usage analytics'
      aria-busy='true'
      className='space-y-8'
    >
      <div className='rounded-2xl border border-panel-border bg-panel p-5 sm:p-7'>
        <Skeleton className='h-4 w-28 bg-secondary' />
        <Skeleton className='mt-5 h-10 w-full max-w-md' />
        <Skeleton className='mt-3 h-4 w-full max-w-xl bg-muted' />
      </div>

      <div className='space-y-4'>
        <div>
          <Skeleton className='h-3 w-20 bg-muted' />
          <Skeleton className='mt-2 h-6 w-40' />
          <Skeleton className='mt-2 h-4 w-full max-w-lg bg-muted' />
        </div>
        <div className='grid gap-4 md:grid-cols-3'>
          {[1, 2, 3].map((id) => (
            <MetricTileSkeleton key={`usage-completion-skeleton-${id}`} />
          ))}
        </div>
      </div>

      <div className='space-y-4'>
        <div>
          <Skeleton className='h-3 w-20 bg-muted' />
          <Skeleton className='mt-2 h-6 w-40' />
          <Skeleton className='mt-2 h-4 w-full max-w-lg bg-muted' />
        </div>
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {[1, 2, 3, 4].map((id) => (
            <MetricTileSkeleton key={`usage-activity-skeleton-${id}`} />
          ))}
        </div>
      </div>

      <div className='rounded-2xl border border-panel-border bg-panel p-5 sm:p-6'>
        <Skeleton className='h-3 w-16 bg-muted' />
        <Skeleton className='mt-2 h-6 w-44' />
        <Skeleton className='mt-2 h-4 w-56 bg-muted' />
        <Skeleton className='mt-6 h-80 w-full bg-secondary' />
      </div>
    </section>
  );
}

function MetricTileSkeleton() {
  return (
    <div className='min-h-44 rounded-2xl border border-panel-border bg-panel p-5 sm:p-6'>
      <Skeleton className='size-11 rounded-full bg-secondary' />
      <Skeleton className='mt-5 h-4 w-28 bg-muted' />
      <Skeleton className='mt-2 h-8 w-24' />
      <Skeleton className='mt-2 h-4 w-36 bg-muted' />
      <Skeleton className='mt-5 h-1.5 w-full rounded-full bg-secondary' />
    </div>
  );
}
