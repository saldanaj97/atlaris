'use client';

import type {
  UsageAnalyticsPlanRow,
  UsageAnalyticsWeekRow,
} from './usage-analytics-model';

import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { PLAN_CHART_COLORS } from '@/shared/constants/chart-colors';
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
} from 'react';

const MIN_VISIBLE_PLAN_COUNT = 1;
const LEGEND_ITEM_WIDTH = 180;
const LEGEND_COLUMN_GAP = 16;
const LINE_ENTER_ANIMATION_MS = 650;
const LABEL_ENTER_ANIMATION_MS = 140;
const METRIC_BAR_CHART_MARGIN = { top: 8, right: 4, left: -4, bottom: 22 };
const COMPACT_AXIS_TICK = { fontSize: 10 };

type RechartsModule = typeof import('recharts');
type RechartsRendererProps = {
  children: (recharts: RechartsModule) => ReactElement;
};
type PointLabelProps = {
  index?: number;
  value?: string | number;
  x?: string | number;
  y?: string | number;
};

const RechartsRenderer = lazy(async () => {
  const recharts = await import('recharts');

  return {
    default: function LoadedRecharts({ children }: RechartsRendererProps) {
      return children(recharts);
    },
  };
});

function WithRecharts({ children }: RechartsRendererProps) {
  return (
    <Suspense fallback={null}>
      <RechartsRenderer>{children}</RechartsRenderer>
    </Suspense>
  );
}

function ResponsiveChartContainer({
  children,
  ResponsiveContainer,
  ...props
}: Omit<ComponentProps<typeof ChartContainer>, 'children'> & {
  children: ReactElement;
  ResponsiveContainer: RechartsModule['ResponsiveContainer'];
}) {
  return (
    <ChartContainer {...props}>
      <ResponsiveContainer>{children}</ResponsiveContainer>
    </ChartContainer>
  );
}

export function RadialTextMetricChart({
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
    <WithRecharts>
      {({ PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer }) => (
        <div className='relative mx-auto h-32 w-32 overflow-visible'>
          <ResponsiveChartContainer
            ResponsiveContainer={ResponsiveContainer}
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
          </ResponsiveChartContainer>
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
      )}
    </WithRecharts>
  );
}

export function RadialStackedMetricChart({
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
    <WithRecharts>
      {({ PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer }) => (
        <div className='relative mx-auto h-36 w-44 overflow-visible'>
          <ResponsiveChartContainer
            ResponsiveContainer={ResponsiveContainer}
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
              <PolarAngleAxis
                type='number'
                domain={[0, chartTotal]}
                tick={false}
              />
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
          </ResponsiveChartContainer>
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
      )}
    </WithRecharts>
  );
}

export function ActiveProgressBarChart({
  weeks,
}: {
  weeks: UsageAnalyticsWeekRow[];
}) {
  const chartData = weeks.map((week) => ({
    week: week.label.split('-')[0],
    changes: week.progressChangeCount,
    isCurrentWeek: week.isCurrentWeek,
  }));

  return (
    <WithRecharts>
      {({
        Bar,
        BarChart,
        CartesianGrid,
        Cell,
        ResponsiveContainer,
        Tooltip,
        XAxis,
        YAxis,
      }) => (
        <ResponsiveChartContainer
          ResponsiveContainer={ResponsiveContainer}
          aria-hidden='true'
          config={{ changes: { label: 'Changes', color: 'var(--chart-2)' } }}
          className='aspect-auto h-36 w-full overflow-visible'
        >
          <BarChart data={chartData} margin={METRIC_BAR_CHART_MARGIN}>
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
            <Tooltip
              cursor={false}
              content={<ChartTooltipContent indicator='dot' />}
            />
            <Bar dataKey='changes' name='Changes' radius={[4, 4, 0, 0]}>
              {chartData.map((week) => (
                <Cell
                  key={week.week}
                  fill={
                    week.isCurrentWeek ? 'var(--chart-2)' : 'var(--chart-1)'
                  }
                  opacity={week.isCurrentWeek ? 1 : 0.45}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveChartContainer>
      )}
    </WithRecharts>
  );
}

export function StackedEventsBarChart({
  weeks,
}: {
  weeks: UsageAnalyticsWeekRow[];
}) {
  const chartData = weeks.map((week) => ({
    week: week.label.split('-')[0],
    completed: week.completedEvents,
    other: Math.max(0, week.progressChangeCount - week.completedEvents),
  }));

  return (
    <WithRecharts>
      {({
        Bar,
        BarChart,
        CartesianGrid,
        ResponsiveContainer,
        Tooltip,
        XAxis,
        YAxis,
      }) => (
        <div>
          <ResponsiveChartContainer
            ResponsiveContainer={ResponsiveContainer}
            aria-hidden='true'
            config={{
              completed: { label: 'Completed', color: 'var(--chart-2)' },
              other: { label: 'Other', color: 'var(--chart-1)' },
            }}
            className='aspect-auto h-36 w-full overflow-visible'
          >
            <BarChart data={chartData} margin={METRIC_BAR_CHART_MARGIN}>
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
              <Tooltip
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
            </BarChart>
          </ResponsiveChartContainer>
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
      )}
    </WithRecharts>
  );
}

export function StreakStepLineChart({
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
    <WithRecharts>
      {({
        CartesianGrid,
        Line,
        LineChart,
        ResponsiveContainer,
        Tooltip,
        XAxis,
        YAxis,
      }) => (
        <ResponsiveChartContainer
          ResponsiveContainer={ResponsiveContainer}
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
            <Tooltip
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
        </ResponsiveChartContainer>
      )}
    </WithRecharts>
  );
}

export function WeeklyLineChart({
  weeks,
  plans,
}: {
  weeks: UsageAnalyticsWeekRow[];
  plans: UsageAnalyticsPlanRow[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [{ hasMeasuredChart, renderedPlanCount }, setChartLayout] = useState({
    hasMeasuredChart: false,
    renderedPlanCount: 0,
  });
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
    weeklyTrendCounts: new Map(
      plan.weeklyTrends.map((week) => [
        week.weekStartDate,
        week.progressChangeCount,
      ]),
    ),
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

    for (const { plan, weeklyTrendCounts } of series) {
      row[plan.id] = weeklyTrendCounts.get(week.weekStartDate) ?? 0;
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

        const nextPlanCount = planCapacityForWidth(chartWidth, plans.length);

        setChartLayout((currentLayout) =>
          currentLayout.hasMeasuredChart &&
          currentLayout.renderedPlanCount === nextPlanCount
            ? currentLayout
            : {
                hasMeasuredChart: true,
                renderedPlanCount: nextPlanCount,
              },
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

  return (
    <div>
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
          <WithRecharts>
            {({
              CartesianGrid,
              LabelList,
              Line,
              LineChart,
              ResponsiveContainer,
              Tooltip,
              XAxis,
              YAxis,
            }) => (
              <ResponsiveChartContainer
                ResponsiveContainer={ResponsiveContainer}
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
                  <Tooltip
                    cursor={false}
                    content={<ChartTooltipContent indicator='line' />}
                  />
                  {series.map(({ plan }) => (
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
                      isAnimationActive
                      animationDuration={LINE_ENTER_ANIMATION_MS}
                      animationEasing='ease-out'
                    >
                      <LabelList
                        dataKey={plan.id}
                        content={(labelProps: PointLabelProps) => (
                          <AnimatedPointLabel
                            {...labelProps}
                            pointCount={weeks.length}
                          />
                        )}
                      />
                    </Line>
                  ))}
                </LineChart>
              </ResponsiveChartContainer>
            )}
          </WithRecharts>
        </div>
      </div>
      <div className='mt-4 flex min-h-6 flex-nowrap gap-4 overflow-x-auto'>
        {series.length > 0 ? (
          series.map(({ plan, color }) => (
            <div
              key={plan.id}
              className='flex w-45 shrink-0 items-center gap-2 text-xs text-muted-foreground'
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
  pointCount,
  value,
  x,
  y,
}: PointLabelProps & { pointCount: number }) {
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
        animation: `usage-analytics-point-label-in ${LABEL_ENTER_ANIMATION_MS}ms ease-out ${delay}ms both`,
      }}
    >
      {value}
    </text>
  );
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}

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

function yAxisTicksForMax(maxValue: number): number[] {
  const step = Math.max(1, Math.ceil(maxValue / 4));
  const ticks = [];

  for (let tick = 0; tick < maxValue; tick += step) {
    ticks.push(tick);
  }

  ticks.push(maxValue);

  return ticks;
}
