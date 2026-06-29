'use client';

import type {
  UsageAnalyticsModel,
  UsageAnalyticsPlanRow,
  UsageAnalyticsWeekRow,
} from './usage-analytics-model';

import { Badge } from '@/components/ui/badge';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import { formatMinutes } from '@/features/plans/formatters';
import { cn } from '@/lib/utils';
import { PLAN_CHART_COLORS } from '@/shared/constants/chart-colors';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  LabelList,
  type LabelProps,
  Line,
  LineChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from 'recharts';

const MIN_VISIBLE_PLAN_COUNT = 1;
const LEGEND_ITEM_WIDTH = 180;
const LEGEND_COLUMN_GAP = 16;
const LINE_ENTER_ANIMATION_MS = 650;
const LINE_EXIT_ANIMATION_MS = 260;
const LABEL_ENTER_ANIMATION_MS = 140;
const METRIC_BAR_CHART_MARGIN = { top: 8, right: 4, left: -4, bottom: 22 };
const COMPACT_AXIS_TICK = { fontSize: 10 };

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
          <h2 className='mt-1 text-xl font-semibold text-foreground'>
            Eight-week pulse
          </h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            Progress changes by week
          </p>
        </div>

        <div className='mt-5'>
          <WeeklyLineChart
            weeks={model.history.weeklyTrends}
            plans={model.plans}
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

function RadialTextMetricChart({
  value,
  sublabel,
  percent,
}: {
  value: string;
  sublabel: string;
  percent: number;
}) {
  const chartData = [{ value: clampPercent(percent) }];

  return (
    <div className='relative mx-auto h-32 w-32 overflow-visible'>
      <ChartContainer
        aria-hidden='true'
        config={{ value: { color: 'var(--chart-2)' } }}
        className='aspect-auto h-32 w-32 overflow-visible'
      >
        <RadialBarChart
          data={chartData}
          startAngle={90}
          endAngle={-270}
          innerRadius={46}
          outerRadius={58}
          margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
        >
          <PolarAngleAxis type='number' domain={[0, 100]} tick={false} />
          <RadialBar
            dataKey='value'
            background={{ fill: 'var(--border)' }}
            cornerRadius={8}
            fill='var(--color-value)'
          />
        </RadialBarChart>
      </ChartContainer>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center'
      >
        <span className='text-2xl font-semibold text-foreground tabular-nums'>
          {value}
        </span>
        <span className='text-xs text-muted-foreground'>{sublabel}</span>
      </div>
    </div>
  );
}

function RadialStackedMetricChart({
  completed,
  total,
  value,
  sublabel,
}: {
  completed: number;
  total: number;
  value: string;
  sublabel: string;
}) {
  const safeTotal = Math.max(0, total);
  const completedValue = Math.min(Math.max(0, completed), safeTotal);
  const chartTotal = Math.max(1, safeTotal);
  const chartData = [
    {
      completed: completedValue,
      remaining: safeTotal > 0 ? Math.max(0, safeTotal - completedValue) : 1,
    },
  ];

  return (
    <div className='relative mx-auto h-36 w-44 overflow-visible'>
      <ChartContainer
        aria-hidden='true'
        config={{
          completed: { color: 'var(--chart-2)' },
          remaining: { color: 'var(--border)' },
        }}
        className='aspect-auto h-36 w-44 overflow-visible'
      >
        <RadialBarChart
          data={chartData}
          startAngle={180}
          endAngle={0}
          innerRadius={48}
          outerRadius={62}
          margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
        >
          <PolarAngleAxis type='number' domain={[0, chartTotal]} tick={false} />
          <RadialBar
            dataKey='completed'
            stackId='time'
            cornerRadius={8}
            fill='var(--color-completed)'
          />
          <RadialBar
            dataKey='remaining'
            stackId='time'
            cornerRadius={8}
            fill='var(--color-remaining)'
          />
        </RadialBarChart>
      </ChartContainer>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 bottom-1 flex flex-col items-center'
      >
        <span className='text-2xl font-semibold text-foreground tabular-nums'>
          {value}
        </span>
        <span className='text-xs text-muted-foreground'>{sublabel}</span>
      </div>
    </div>
  );
}

function ActiveProgressBarChart({ weeks }: { weeks: UsageAnalyticsWeekRow[] }) {
  const chartData = weeks.map((week) => ({
    week: week.label.split('-')[0],
    changes: week.progressChangeCount,
    isCurrentWeek: week.isCurrentWeek,
  }));

  return (
    <ChartContainer
      aria-hidden='true'
      config={{ changes: { label: 'Changes', color: 'var(--chart-2)' } }}
      className='aspect-auto h-36 w-full overflow-visible'
    >
      <RechartsBarChart data={chartData} margin={METRIC_BAR_CHART_MARGIN}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey='week'
          tickLine={false}
          axisLine={false}
          tick={COMPACT_AXIS_TICK}
          interval={0}
          minTickGap={0}
        />
        <YAxis hide domain={[0, 'dataMax + 1']} />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent indicator='dot' />}
        />
        <Bar dataKey='changes' name='Changes' radius={[4, 4, 0, 0]}>
          {chartData.map((week) => (
            <Cell
              key={week.week}
              fill={week.isCurrentWeek ? 'var(--chart-2)' : 'var(--chart-1)'}
              opacity={week.isCurrentWeek ? 1 : 0.45}
            />
          ))}
        </Bar>
      </RechartsBarChart>
    </ChartContainer>
  );
}

function StackedEventsBarChart({ weeks }: { weeks: UsageAnalyticsWeekRow[] }) {
  const chartData = weeks.map((week) => ({
    week: week.label.split('-')[0],
    completed: week.completedEvents,
    other: Math.max(0, week.progressChangeCount - week.completedEvents),
  }));

  return (
    <div>
      <ChartContainer
        aria-hidden='true'
        config={{
          completed: { label: 'Completed', color: 'var(--chart-2)' },
          other: { label: 'Other', color: 'var(--chart-1)' },
        }}
        className='aspect-auto h-36 w-full overflow-visible'
      >
        <RechartsBarChart data={chartData} margin={METRIC_BAR_CHART_MARGIN}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey='week'
            tickLine={false}
            axisLine={false}
            tick={COMPACT_AXIS_TICK}
            interval={0}
            minTickGap={0}
          />
          <YAxis hide domain={[0, 'dataMax + 1']} />
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent indicator='dot' />}
          />
          <Bar
            dataKey='other'
            name='Other changes'
            stackId='events'
            fill='var(--color-other)'
            radius={[0, 0, 4, 4]}
          />
          <Bar
            dataKey='completed'
            name='Completed events'
            stackId='events'
            fill='var(--color-completed)'
            radius={[4, 4, 0, 0]}
          />
        </RechartsBarChart>
      </ChartContainer>
      <div className='mt-2 flex justify-center gap-4 text-xs text-muted-foreground'>
        <span className='flex items-center gap-1.5'>
          <span className='size-2 rounded-full bg-chart-2' />
          Completed
        </span>
        <span className='flex items-center gap-1.5'>
          <span className='size-2 rounded-full bg-chart-1 opacity-60' />
          Other
        </span>
      </div>
    </div>
  );
}

function StreakStepLineChart({
  current,
  longest,
}: {
  current: number;
  longest: number;
}) {
  const chartData = [
    { label: 'Best', days: longest },
    { label: 'Current', days: current },
  ];

  return (
    <ChartContainer
      aria-hidden='true'
      config={{ days: { label: 'Days', color: 'var(--chart-2)' } }}
      className='aspect-auto h-36 w-full overflow-visible'
    >
      <LineChart
        data={chartData}
        margin={{ top: 8, right: 8, left: -4, bottom: 16 }}
      >
        <CartesianGrid vertical={false} strokeDasharray='4 6' />
        <XAxis
          dataKey='label'
          tickLine={false}
          axisLine={false}
          tick={COMPACT_AXIS_TICK}
        />
        <YAxis hide domain={[0, Math.max(1, longest, current)]} />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent indicator='line' />}
        />
        <Line
          dataKey='days'
          name='Streak'
          type='step'
          stroke='var(--color-days)'
          strokeWidth={3}
          dot={false}
          activeDot={false}
        />
      </LineChart>
    </ChartContainer>
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
        <TrendingUp aria-hidden='true' className='size-4' style={iconStyle} />
      );
    case 'down':
      return (
        <TrendingDown aria-hidden='true' className='size-4' style={iconStyle} />
      );
    case 'flat':
      return <Minus aria-hidden='true' className='size-4' style={iconStyle} />;
    default: {
      const unhandled: never = kind;
      throw new Error(`Unhandled trend icon: ${unhandled}`);
    }
  }
}

/** Keeps radial gauges inside their expected 0-100 progress range. */
function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
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

/** Renders a multi-plan line chart of weekly progress changes with a responsive legend. */
function WeeklyLineChart({
  weeks,
  plans,
}: {
  weeks: UsageAnalyticsWeekRow[];
  plans: UsageAnalyticsPlanRow[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasMeasuredChart, setHasMeasuredChart] = useState(false);
  const [visiblePlanCount, setVisiblePlanCount] = useState(0);
  const [renderedPlanCount, setRenderedPlanCount] = useState(0);
  const [vanishingPlanCount, setVanishingPlanCount] = useState<number | null>(
    null,
  );
  const renderedPlans = plans.slice(0, renderedPlanCount);
  const dataMaxValue = Math.max(
    1,
    ...renderedPlans.flatMap((plan) =>
      plan.weeklyTrends.map((week) => week.progressChangeCount),
    ),
  );
  const maxValue = dataMaxValue + 1;
  const yAxisTicks = yAxisTicksForMax(maxValue);
  const series = renderedPlans.map((plan, index) => ({
    plan,
    color: PLAN_CHART_COLORS[index % PLAN_CHART_COLORS.length],
    isVanishing: vanishingPlanCount !== null && index >= vanishingPlanCount,
  }));
  const chartConfig: ChartConfig = Object.fromEntries(
    series.map(({ plan, color }) => [
      plan.id,
      {
        label: plan.topic,
        color,
      },
    ]),
  );
  const chartData = weeks.map((week) => {
    const row: Record<string, string | number> = {
      week: week.label.split('-')[0],
    };

    for (const { plan } of series) {
      row[plan.id] =
        plan.weeklyTrends.find(
          (trend) => trend.weekStartDate === week.weekStartDate,
        )?.progressChangeCount ?? 0;
    }

    return row;
  });

  useEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return;
    }

    let updateFrame: number | null = null;

    const updateVisiblePlanCount = () => {
      const chartWidth = element.clientWidth;

      if (chartWidth <= 0) {
        return;
      }

      if (updateFrame !== null) {
        window.cancelAnimationFrame(updateFrame);
      }

      updateFrame = window.requestAnimationFrame(() => {
        updateFrame = null;
        setHasMeasuredChart(true);

        const nextPlanCount = planCapacityForWidth(chartWidth, plans.length);

        setVisiblePlanCount((currentPlanCount) =>
          currentPlanCount === nextPlanCount ? currentPlanCount : nextPlanCount,
        );
      });
    };

    updateVisiblePlanCount();

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updateVisiblePlanCount);
    resizeObserver?.observe(element);

    return () => {
      if (updateFrame !== null) {
        window.cancelAnimationFrame(updateFrame);
      }

      resizeObserver?.disconnect();
    };
  }, [plans.length]);

  useEffect(() => {
    if (visiblePlanCount >= renderedPlanCount) {
      setVanishingPlanCount(null);
      setRenderedPlanCount(visiblePlanCount);
      return;
    }

    setVanishingPlanCount(visiblePlanCount);

    const timeout = window.setTimeout(() => {
      setRenderedPlanCount(visiblePlanCount);
      setVanishingPlanCount(null);
    }, LINE_EXIT_ANIMATION_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [renderedPlanCount, visiblePlanCount]);

  return (
    <div role='img' aria-label='Progress changes by week for each plan'>
      <style>
        {`
          @keyframes usage-analytics-point-label-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}
      </style>
      <div className='flex gap-2'>
        <div className='flex h-80 w-11 shrink-0 items-center justify-center'>
          <p className='-rotate-90 text-sm whitespace-nowrap text-muted-foreground'>
            Progress changes
          </p>
        </div>
        <div
          ref={containerRef}
          data-testid='weekly-line-chart'
          className='min-w-0 flex-1'
        >
          <ChartContainer
            config={chartConfig}
            className='h-80 w-full overflow-visible'
          >
            <LineChart
              accessibilityLayer
              data={chartData}
              margin={{ top: 28, right: 18, bottom: 28, left: 0 }}
            >
              <CartesianGrid vertical={false} strokeDasharray='4 6' />
              <XAxis
                dataKey='week'
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                label={{
                  value: 'Week',
                  position: 'insideBottom',
                  offset: -16,
                }}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                domain={[0, maxValue]}
                tickLine={false}
                tickMargin={10}
                ticks={yAxisTicks}
                width={34}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator='line' />}
              />
              {series.map(({ plan, isVanishing }) => (
                <Line
                  key={plan.id}
                  className='analytics-plan-line'
                  data-testid='plan-series'
                  dataKey={plan.id}
                  name={plan.topic}
                  type='linear'
                  stroke={`var(--color-${plan.id})`}
                  strokeWidth={4}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={!isVanishing}
                  animationDuration={LINE_ENTER_ANIMATION_MS}
                  animationEasing='ease-out'
                  opacity={isVanishing ? 0 : 1}
                  style={{
                    transition: `opacity ${LINE_EXIT_ANIMATION_MS}ms ease`,
                  }}
                >
                  <LabelList
                    dataKey={plan.id}
                    content={(labelProps) => (
                      <AnimatedPointLabel
                        {...labelProps}
                        isVanishing={isVanishing}
                        pointCount={weeks.length}
                      />
                    )}
                  />
                </Line>
              ))}
            </LineChart>
          </ChartContainer>
        </div>
      </div>
      <div className='mt-4 flex min-h-6 flex-nowrap gap-4 overflow-x-auto'>
        {series.length > 0 ? (
          series.map(({ plan, color, isVanishing }) => (
            <div
              key={plan.id}
              className='flex w-45 shrink-0 items-center gap-2 text-xs text-muted-foreground'
              style={{
                opacity: isVanishing ? 0 : 1,
                transition: `opacity ${LINE_EXIT_ANIMATION_MS}ms ease`,
              }}
            >
              <span
                className='size-2.5 shrink-0 rounded-full'
                style={{ backgroundColor: color }}
              />
              <span className='min-w-0 truncate'>{plan.topic}</span>
            </div>
          ))
        ) : hasMeasuredChart ? (
          <p className='text-xs text-muted-foreground'>No plans yet</p>
        ) : null}
      </div>
    </div>
  );
}

function AnimatedPointLabel({
  index = 0,
  isVanishing,
  pointCount,
  value,
  x,
  y,
}: LabelProps & { isVanishing: boolean; pointCount: number }) {
  const labelX = typeof x === 'number' ? x : Number(x);
  const labelY = typeof y === 'number' ? y : Number(y);

  if (value == null || !Number.isFinite(labelX) || !Number.isFinite(labelY)) {
    return null;
  }

  const delay = Math.round(
    (Math.max(0, index) / Math.max(1, pointCount - 1)) *
      LINE_ENTER_ANIMATION_MS,
  );

  return (
    <text
      x={labelX}
      y={labelY - 10}
      textAnchor='middle'
      className='analytics-point-label fill-foreground'
      fontSize={12}
      style={{
        animation: isVanishing
          ? undefined
          : `usage-analytics-point-label-in ${LABEL_ENTER_ANIMATION_MS}ms ease-out ${delay}ms both`,
        opacity: isVanishing ? 0 : undefined,
        transition: `opacity ${LINE_EXIT_ANIMATION_MS}ms ease`,
      }}
    >
      {value}
    </text>
  );
}

/** Computes how many plan series fit in the chart legend for a given container width. */
function planCapacityForWidth(width: number, planCount: number): number {
  if (planCount === 0) {
    return 0;
  }

  if (width <= 0) {
    return MIN_VISIBLE_PLAN_COUNT;
  }

  return Math.min(
    planCount,
    Math.max(
      MIN_VISIBLE_PLAN_COUNT,
      Math.floor(
        (width + LEGEND_COLUMN_GAP) / (LEGEND_ITEM_WIDTH + LEGEND_COLUMN_GAP),
      ),
    ),
  );
}

/** Builds evenly spaced Y-axis tick values up to the chart maximum. */
function yAxisTicksForMax(maxValue: number): number[] {
  const step = Math.max(1, Math.ceil(maxValue / 4));
  const ticks = [];

  for (let tick = 0; tick < maxValue; tick += step) {
    ticks.push(tick);
  }

  ticks.push(maxValue);

  return ticks;
}
