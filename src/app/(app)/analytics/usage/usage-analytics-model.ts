import type {
  LightweightPlanSummary,
  ProgressStatus,
} from '@/shared/types/db.types';

import {
  addDays,
  currentStreakDays,
  dateFromKey,
  dateKeyInTimeZone,
  DEFAULT_ANALYTICS_TIMEZONE,
  longestStreakDays,
  normalizeTimeZone,
  weekStartKey,
} from '@/shared/analytics/learning-activity-time';

export type UsageAnalyticsActivityEvent = {
  planId: string;
  status: ProgressStatus;
  taskEstimatedMinutes: number;
  occurredAt: Date;
};

export type UsageAnalyticsWeekRow = {
  weekStartDate: string;
  label: string;
  activeDays: number;
  progressChangeCount: number;
  completedEvents: number;
  estimatedCompletionAddedMinutes: number;
  isCurrentWeek: boolean;
};

export type UsageAnalyticsPlanRow = {
  id: string;
  topic: string;
  weeklyTrends: UsageAnalyticsWeekRow[];
};

export type UsageAnalyticsModel = {
  plans: UsageAnalyticsPlanRow[];
  completedTasks: number;
  totalTasks: number;
  taskCompletionPercent: number;
  completedModules: number;
  totalModules: number;
  moduleCompletionPercent: number;
  completedMinutes: number;
  totalMinutes: number;
  analyticsTimezone: string;
  history: {
    hasActivity: boolean;
    currentStreakDays: number;
    longestStreakDays: number;
    currentWeek: UsageAnalyticsWeekRow;
    weeklyTrends: UsageAnalyticsWeekRow[];
  };
};

type BuildUsageAnalyticsOptions = {
  activityEvents?: UsageAnalyticsActivityEvent[];
  analyticsTimezone?: string;
  referenceDate?: Date;
};

type MutableWeekRow = Omit<UsageAnalyticsWeekRow, 'activeDays'> & {
  activeDayKeys: Set<string>;
};

type MutablePlanHistory = {
  weekRows: MutableWeekRow[];
  weekRowsByStart: Map<string, MutableWeekRow>;
};

const WEEK_TREND_COUNT = 8;
const WEEK_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: DEFAULT_ANALYTICS_TIMEZONE,
});

/** Most plans the eight-week pulse plots; one per chart color. */
export const PULSE_PLAN_LIMIT = 5;

/**
 * Evenly spaced y-axis ticks from 0 that reach at least `maxValue`, about
 * four steps. The last tick is the axis top, so the domain ends on a step.
 */
export function yAxisTicksForMax(maxValue: number): number[] {
  const top = Math.max(1, Math.ceil(maxValue));
  const step = Math.ceil(top / 4);
  const ticks = [];

  for (let tick = 0; tick < top + step; tick += step) {
    ticks.push(tick);
  }

  return ticks;
}

export type PointLabelPlacement = 'above' | 'below' | null;

/**
 * Where each series' value label goes at one week, so labels don't sit on a
 * neighbouring line or label. The highest value labels above its point; a
 * value close under a labelled one labels below. A label needs `nearGap` of
 * room, so after a label placed below, the next value labels below only once
 * it clears that label and above only once it clears it twice; closer than
 * that it gets none. Zeros and repeats of a labelled value get none too (the
 * tooltip still reads them). `nearGap` is in axis units.
 */
export function pointLabelPlacements(
  values: readonly number[],
  maxValue: number,
): PointLabelPlacement[] {
  const nearGap = Math.max(maxValue, 1) * 0.13;
  const placements: PointLabelPlacement[] = values.map(() => null);
  const order = values
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value > 0)
    .sort((a, b) => b.value - a.value);

  // Values arrive highest first, so the last label is the only one this value
  // can repeat or run into: every earlier label sits higher.
  let lastValue: number | null = null;
  let lastBelow = false;
  for (const { value, index } of order) {
    if (value === lastValue) continue;
    const gap = lastValue === null ? Infinity : lastValue - value;
    const room: number = lastBelow ? gap - nearGap : gap;
    if (room < 0) continue;
    lastBelow = room < nearGap;
    placements[index] = lastBelow ? 'below' : 'above';
    lastValue = value;
  }

  return placements;
}

/**
 * Picks the plans with the most progress changes in the pulse window, most
 * active first. Ties keep the incoming order.
 */
export function selectMostActivePlans(
  plans: UsageAnalyticsPlanRow[],
  limit: number = PULSE_PLAN_LIMIT,
): UsageAnalyticsPlanRow[] {
  const ranked = plans
    .map((plan, index) => ({
      plan,
      index,
      activity: plan.weeklyTrends.reduce(
        (sum, week) => sum + week.progressChangeCount,
        0,
      ),
    }))
    .sort((a, b) => b.activity - a.activity || a.index - b.index);
  return ranked.slice(0, limit).map(({ plan }) => plan);
}

/** Returns floored completion percent, capped at 100 when fully complete. */
function completionPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return completed >= total ? 100 : Math.floor((completed / total) * 100);
}

/** Formats a week range label such as "Jun 1-Jun 7". */
function formatWeekLabel(weekStartDate: string): string {
  const weekEndDate = addDays(weekStartDate, 6);

  return `${WEEK_LABEL_FORMATTER.format(
    dateFromKey(weekStartDate),
  )}-${WEEK_LABEL_FORMATTER.format(dateFromKey(weekEndDate))}`;
}

/** Builds mutable weekly trend rows ending at the current week. */
function buildWeekRows(currentWeekStart: string): MutableWeekRow[] {
  return Array.from({ length: WEEK_TREND_COUNT }, (_, index) => {
    const weekStartDate = addDays(
      currentWeekStart,
      (index - WEEK_TREND_COUNT + 1) * 7,
    );

    return {
      weekStartDate,
      label: formatWeekLabel(weekStartDate),
      activeDayKeys: new Set<string>(),
      progressChangeCount: 0,
      completedEvents: 0,
      estimatedCompletionAddedMinutes: 0,
      isCurrentWeek: weekStartDate === currentWeekStart,
    };
  });
}

/** Converts a mutable week row into the public analytics week shape. */
function toWeekRow(row: MutableWeekRow): UsageAnalyticsWeekRow {
  return {
    weekStartDate: row.weekStartDate,
    label: row.label,
    activeDays: row.activeDayKeys.size,
    progressChangeCount: row.progressChangeCount,
    completedEvents: row.completedEvents,
    estimatedCompletionAddedMinutes: row.estimatedCompletionAddedMinutes,
    isCurrentWeek: row.isCurrentWeek,
  };
}

/** Builds the usage analytics view model from plan summaries and activity events. */
export function buildUsageAnalyticsModel(
  summaries: LightweightPlanSummary[],
  options: BuildUsageAnalyticsOptions = {},
): UsageAnalyticsModel {
  const analyticsTimezone = normalizeTimeZone(options.analyticsTimezone);
  const activityEvents = options.activityEvents ?? [];
  const todayKey = dateKeyInTimeZone(
    options.referenceDate ?? new Date(),
    analyticsTimezone,
  );
  const currentWeekStart = weekStartKey(todayKey);
  const weekRows = buildWeekRows(currentWeekStart);
  const weekRowsByStart = new Map(
    weekRows.map((row) => [row.weekStartDate, row]),
  );
  const globalDayKeys = new Set<string>();
  const planHistoryById = new Map<string, MutablePlanHistory>();

  for (const summary of summaries) {
    const planWeekRows = buildWeekRows(currentWeekStart);
    planHistoryById.set(summary.id, {
      weekRows: planWeekRows,
      weekRowsByStart: new Map(
        planWeekRows.map((row) => [row.weekStartDate, row]),
      ),
    });
  }

  for (const event of activityEvents) {
    const dayKey = dateKeyInTimeZone(event.occurredAt, analyticsTimezone);
    const eventWeekStart = weekStartKey(dayKey);
    const weekRow = weekRowsByStart.get(eventWeekStart);
    const isCompletedEvent = event.status === 'completed';

    globalDayKeys.add(dayKey);

    if (weekRow) {
      weekRow.activeDayKeys.add(dayKey);
      weekRow.progressChangeCount += 1;
      if (isCompletedEvent) {
        weekRow.completedEvents += 1;
        weekRow.estimatedCompletionAddedMinutes += event.taskEstimatedMinutes;
      }
    }

    const planHistory = planHistoryById.get(event.planId);
    if (!planHistory) continue;

    const planWeekRow = planHistory.weekRowsByStart.get(eventWeekStart);
    if (planWeekRow) {
      planWeekRow.activeDayKeys.add(dayKey);
      planWeekRow.progressChangeCount += 1;
      if (isCompletedEvent) {
        planWeekRow.completedEvents += 1;
        planWeekRow.estimatedCompletionAddedMinutes +=
          event.taskEstimatedMinutes;
      }
    }
  }

  const plans = summaries.map((summary) => {
    const planHistory = planHistoryById.get(summary.id)!;

    return {
      id: summary.id,
      topic: summary.topic,
      weeklyTrends: planHistory.weekRows.map(toWeekRow),
    };
  });

  const totals = summaries.reduce(
    (acc, summary) => {
      acc.completedTasks += summary.completedTasks;
      acc.totalTasks += summary.totalTasks;
      acc.completedModules += summary.completedModules;
      acc.totalModules += summary.moduleCount;
      acc.completedMinutes += summary.completedMinutes;
      acc.totalMinutes += summary.totalMinutes;
      return acc;
    },
    {
      completedTasks: 0,
      totalTasks: 0,
      completedModules: 0,
      totalModules: 0,
      completedMinutes: 0,
      totalMinutes: 0,
    },
  );

  const weeklyTrends = weekRows.map(toWeekRow);
  const currentWeek = weeklyTrends.find((row) => row.isCurrentWeek);

  if (!currentWeek) {
    throw new Error('Current analytics week missing from trend rows');
  }

  return {
    plans,
    completedTasks: totals.completedTasks,
    totalTasks: totals.totalTasks,
    taskCompletionPercent: completionPercent(
      totals.completedTasks,
      totals.totalTasks,
    ),
    completedModules: totals.completedModules,
    totalModules: totals.totalModules,
    moduleCompletionPercent: completionPercent(
      totals.completedModules,
      totals.totalModules,
    ),
    completedMinutes: totals.completedMinutes,
    totalMinutes: totals.totalMinutes,
    analyticsTimezone,
    history: {
      hasActivity: weeklyTrends.some((row) => row.progressChangeCount > 0),
      currentStreakDays: currentStreakDays(globalDayKeys, todayKey),
      longestStreakDays: longestStreakDays(globalDayKeys),
      currentWeek,
      weeklyTrends,
    },
  };
}
