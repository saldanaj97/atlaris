'use client';

import type { UsageAnalyticsModel } from './usage-analytics-model';
import type { ReactNode } from 'react';

import {
  ActiveProgressBarChart,
  RadialStackedMetricChart,
  RadialTextMetricChart,
  StackedEventsBarChart,
  StreakStepLineChart,
  WeeklyLineChart,
} from './usage-analytics-charts';
import { ledgerGlassSurface } from '@/app/(app)/settings/components/LedgerPrimitives';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import { formatMinutes } from '@/features/plans/formatters';
import { cn } from '@/lib/utils';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

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
        className={cn(ledgerGlassSurface, 'w-full px-5 pt-5 shadow-none')}
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

/** Renders one summary metric with value, detail, trend, and week-over-week comparison. */
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
  status?: MetricTrend | null;
  comparison: string;
  chart: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-72 flex-col p-4',
        ledgerGlassSurface,
        className,
      )}
    >
      <div className='flex items-start justify-between gap-3'>
        <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
          {label}
        </p>
        {status ? (
          <span role='img' aria-label={status.label} className='inline-flex'>
            <TrendStatusIcon kind={status.icon} />
          </span>
        ) : null}
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

type MetricTrend = {
  label: 'Up' | 'Down' | 'Flat';
  icon: 'up' | 'down' | 'flat';
};

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
