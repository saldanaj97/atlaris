'use client';

import type { UsageAnalyticsModel } from './usage-analytics-model';

import {
  ActiveProgressBarChart,
  RadialStackedMetricChart,
  RadialTextMetricChart,
  StackedEventsBarChart,
  StreakStepLineChart,
  WeeklyLineChart,
} from './usage-analytics-charts';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import { formatMinutes } from '@/features/plans/formatters';
import { cn } from '@/lib/utils';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';

const EIGHT_WEEK_PULSE_TITLE_ID = 'usage-eight-week-pulse-title';
const EIGHT_WEEK_PULSE_DESCRIPTION_ID = 'usage-eight-week-pulse-description';
const EIGHT_WEEK_PULSE_SUMMARY_ID = 'usage-eight-week-pulse-summary';

/** Renders the usage analytics page: eight-week pulse chart and summary metric tiles. */
export function UsageAnalyticsContent({
  model,
}: {
  model: UsageAnalyticsModel;
}) {
  const currentWeek = model.history.currentWeek;
  const previousWeek = model.history.weeklyTrends.at(-2) ?? null;
  const cards = [
    {
      label: 'Tasks',
      value: `${model.taskCompletionPercent}%`,
      detail:
        model.totalTasks > 0
          ? `${model.completedTasks} / ${model.totalTasks} complete`
          : 'No tasks tracked yet',
      status: completionStatus(
        model.taskCompletionPercent,
        model.totalTasks,
        currentWeek.progressChangeCount,
      ),
      comparison:
        model.totalTasks > 0
          ? remainingLabel(model.totalTasks - model.completedTasks, 'task')
          : 'Create a plan to track tasks',
      chart: (
        <RadialTextMetricChart
          value={`${model.taskCompletionPercent}%`}
          sublabel='Tasks'
          percent={model.taskCompletionPercent}
        />
      ),
      className: 'sm:col-span-2',
    },
    {
      label: 'Modules',
      value: `${model.moduleCompletionPercent}%`,
      detail:
        model.totalModules > 0
          ? `${model.completedModules} / ${model.totalModules} complete`
          : 'No modules tracked yet',
      status: completionStatus(
        model.moduleCompletionPercent,
        model.totalModules,
        currentWeek.progressChangeCount,
      ),
      comparison:
        model.totalModules > 0
          ? remainingLabel(
              model.totalModules - model.completedModules,
              'module',
            )
          : 'Create a plan to track modules',
      chart: (
        <RadialTextMetricChart
          value={`${model.moduleCompletionPercent}%`}
          sublabel='Modules'
          percent={model.moduleCompletionPercent}
        />
      ),
    },
    {
      label: 'Completed time',
      value: formatMinutes(model.completedMinutes),
      detail:
        model.totalMinutes > 0
          ? `${formatMinutes(model.totalMinutes)} planned total`
          : 'No estimated time yet',
      status: activityStatus(
        currentWeek.estimatedCompletionAddedMinutes,
        previousWeek?.estimatedCompletionAddedMinutes ?? 0,
        { idleLabel: 'No gain' },
      ),
      comparison:
        model.totalMinutes > 0
          ? formatMinuteDelta(
              currentWeek.estimatedCompletionAddedMinutes,
              previousWeek?.estimatedCompletionAddedMinutes ?? 0,
            )
          : 'Create a plan to track time',
      chart: (
        <RadialStackedMetricChart
          completed={model.completedMinutes}
          total={model.totalMinutes}
          value={formatMinutes(model.completedMinutes)}
          sublabel='Completed'
        />
      ),
    },
    {
      label: 'Progress changes',
      value: currentWeek.progressChangeCount.toString(),
      detail: `Across ${formatDayCount(currentWeek.activeDays).toLowerCase()}`,
      status: activityStatus(
        currentWeek.progressChangeCount,
        previousWeek?.progressChangeCount ?? 0,
        { idleLabel: 'Quiet' },
      ),
      comparison: formatCountDelta(
        currentWeek.progressChangeCount,
        previousWeek?.progressChangeCount ?? 0,
        'change',
      ),
      chart: <ActiveProgressBarChart weeks={model.history.weeklyTrends} />,
    },
    {
      label: 'Completed events',
      value: currentWeek.completedEvents.toString(),
      detail: `${formatMinutes(currentWeek.estimatedCompletionAddedMinutes)} added`,
      status: activityStatus(
        currentWeek.completedEvents,
        previousWeek?.completedEvents ?? 0,
        { idleLabel: 'Quiet' },
      ),
      comparison: formatCountDelta(
        currentWeek.completedEvents,
        previousWeek?.completedEvents ?? 0,
        'event',
      ),
      chart: <StackedEventsBarChart weeks={model.history.weeklyTrends} />,
    },
    {
      label: 'Active days',
      value: `${currentWeek.activeDays}/7`,
      detail: `${currentWeek.progressChangeCount} changes logged`,
      status: activityStatus(
        currentWeek.activeDays,
        previousWeek?.activeDays ?? 0,
        {
          idleLabel: 'Idle',
        },
      ),
      comparison: formatCountDelta(
        currentWeek.activeDays,
        previousWeek?.activeDays ?? 0,
        'day',
      ),
      chart: (
        <RadialTextMetricChart
          value={`${currentWeek.activeDays}/7`}
          sublabel='Active days'
          percent={(currentWeek.activeDays / 7) * 100}
        />
      ),
    },
    {
      label: 'Streak',
      value: formatDayCount(model.history.currentStreakDays),
      detail: `Best ${formatDayCount(model.history.longestStreakDays)}`,
      status: streakStatus(
        model.history.currentStreakDays,
        model.history.longestStreakDays,
      ),
      comparison: streakComparison(
        model.history.currentStreakDays,
        model.history.longestStreakDays,
      ),
      chart: (
        <StreakStepLineChart
          current={model.history.currentStreakDays}
          longest={model.history.longestStreakDays}
        />
      ),
    },
  ] as const;

  return (
    <div className='space-y-5'>
      <PageHeader
        title='Usage'
        subtitle='Current completion progress, weekly progress changes, and estimated completed learning time from your plans.'
      />

      <Surface
        aria-label='Eight-week pulse analytics design'
        padding='none'
        className='w-full rounded-lg px-5 pt-5'
      >
        <div className='min-w-0'>
          <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
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
            Progress changes by week
          </p>
          <p id={EIGHT_WEEK_PULSE_SUMMARY_ID} className='sr-only'>
            Line chart showing progress changes by week for each plan.
          </p>
        </div>

        <div className='mt-5'>
          <WeeklyLineChart
            weeks={model.history.weeklyTrends}
            plans={model.plans}
            labelledBy={EIGHT_WEEK_PULSE_TITLE_ID}
            describedBy={`${EIGHT_WEEK_PULSE_DESCRIPTION_ID} ${EIGHT_WEEK_PULSE_SUMMARY_ID}`}
          />
        </div>
      </Surface>

      <section
        aria-label='Usage analytics summary'
        className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'
      >
        {cards.map((card) => (
          <MetricTile key={card.label} {...card} />
        ))}
      </section>
    </div>
  );
}

/** Renders one summary metric with value, detail, status badge, and week-over-week comparison. */
function MetricTile({
  label,
  value,
  detail,
  status,
  comparison,
  chart,
  className,
}: {
  label: string;
  value: string;
  detail: string;
  status: MetricStatus;
  comparison: string;
  chart: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-72 flex-col rounded-lg border border-panel-border bg-panel p-4',
        className,
      )}
    >
      <div className='flex items-start justify-between gap-3'>
        <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
          {label}
        </p>
        <MetricStatusBadge status={status} />
      </div>

      <div className='mt-3 min-w-0'>
        <p className='text-4xl font-semibold text-foreground tabular-nums'>
          {value}
        </p>
        <p className='mt-2 text-sm text-muted-foreground'>{detail}</p>
      </div>

      <div className='mt-4 min-h-36 overflow-visible'>{chart}</div>
      <p className='mt-auto pt-3 text-sm text-muted-foreground'>{comparison}</p>
    </div>
  );
}

function MetricStatusBadge({ status }: { status: MetricStatus }) {
  if (status.trendIcon) {
    return (
      <span aria-label={status.label} className='inline-flex'>
        <TrendStatusIcon kind={status.trendIcon} />
      </span>
    );
  }

  return (
    <Badge
      variant='product'
      className={cn(
        'border-transparent px-2 py-1 text-[10px] font-semibold uppercase',
        STATUS_TONE_CLASSNAME[status.tone],
      )}
    >
      {status.label}
    </Badge>
  );
}

type MetricStatus = {
  label: string;
  tone: 'success' | 'neutral' | 'muted' | 'warning' | 'destructive';
  trendIcon?: 'up' | 'down' | 'flat';
};

const STATUS_TONE_CLASSNAME: Record<MetricStatus['tone'], string> = {
  success:
    'bg-success/15 text-success dark:bg-success/25 dark:text-success-foreground',
  neutral: 'bg-primary/10 text-primary dark:bg-primary/20',
  muted: 'bg-panel-muted text-muted-foreground',
  warning:
    'bg-warning/15 text-warning dark:bg-warning/25 dark:text-warning-foreground',
  destructive:
    'bg-destructive/15 text-destructive dark:bg-destructive/25 dark:text-destructive-foreground',
};

const TREND_ICON_COLOR: Record<
  NonNullable<MetricStatus['trendIcon']>,
  string
> = {
  up: '#22c55e',
  down: '#fb7185',
  flat: '#2f81f7',
};

/** Renders the up, down, or flat trend icon for a metric status. */
function TrendStatusIcon({
  kind,
}: {
  kind: NonNullable<MetricStatus['trendIcon']>;
}) {
  const iconStyle = { color: TREND_ICON_COLOR[kind] };

  switch (kind) {
    case 'up':
      return (
        <TrendingUp aria-hidden='true' className='size-5' style={iconStyle} />
      );
    case 'down':
      return (
        <TrendingDown aria-hidden='true' className='size-5' style={iconStyle} />
      );
    case 'flat':
      return <Minus aria-hidden='true' className='size-5' style={iconStyle} />;
    default: {
      const unhandled: never = kind;
      throw new Error(`Unhandled trend icon: ${unhandled}`);
    }
  }
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

/** Derives a status badge for completion percent and weekly activity. */
function completionStatus(
  percent: number,
  total: number,
  progressChangesThisWeek: number,
): MetricStatus {
  if (total === 0) {
    return { label: 'No plans', tone: 'muted' };
  }

  if (percent >= 100) {
    return { label: 'Done', tone: 'success' };
  }

  if (progressChangesThisWeek === 0) {
    return { label: 'Idle', tone: 'warning' };
  }

  return { label: 'Active', tone: 'neutral' };
}

/** Compares current and previous values to produce a trend status. */
function activityStatus(
  current: number,
  previous: number,
  options: {
    idleLabel: string;
  },
): MetricStatus {
  if (current === 0 && previous === 0) {
    return { label: options.idleLabel, tone: 'muted' };
  }

  if (current > previous) {
    return { label: 'Up', tone: 'success', trendIcon: 'up' };
  }

  if (current < previous) {
    return { label: 'Down', tone: 'destructive', trendIcon: 'down' };
  }

  return { label: 'Flat', tone: 'neutral', trendIcon: 'flat' };
}

/** Derives a streak status from current and longest streak lengths. */
function streakStatus(current: number, longest: number): MetricStatus {
  if (current === 0 && longest === 0) {
    return { label: 'No streak', tone: 'muted' };
  }

  if (current === 0) {
    return { label: 'Reset', tone: 'warning' };
  }

  if (current >= longest) {
    return { label: 'Best', tone: 'success' };
  }

  return { label: 'Live', tone: 'neutral' };
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

/** Formats a week-over-week delta for estimated completed minutes. */
function formatMinuteDelta(current: number, previous: number): string {
  const delta = current - previous;

  if (delta === 0) {
    return 'No change vs last week';
  }

  return `${delta > 0 ? '+' : '-'}${formatMinutes(Math.abs(delta))} vs last week`;
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
