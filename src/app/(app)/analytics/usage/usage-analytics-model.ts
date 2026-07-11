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
  completedTasks: number;
  totalTasks: number;
  taskCompletionPercent: number;
  completedModules: number;
  totalModules: number;
  completedMinutes: number;
  totalMinutes: number;
  currentStreakDays: number;
  activeDaysThisWeek: number;
  completedEventsThisWeek: number;
  estimatedCompletionAddedThisWeek: number;
  weeklyTrends: UsageAnalyticsWeekRow[];
};

export type UsageAnalyticsModel = {
  plans: UsageAnalyticsPlanRow[];
  planCount: number;
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
    maxWeeklyProgressChanges: number;
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
  dayKeys: Set<string>;
  activeDaysThisWeek: Set<string>;
  completedEventsThisWeek: number;
  estimatedCompletionAddedThisWeek: number;
  weekRows: MutableWeekRow[];
  weekRowsByStart: Map<string, MutableWeekRow>;
};

const WEEK_TREND_COUNT = 8;

/** Returns floored completion percent, capped at 100 when fully complete. */
function completionPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return completed >= total ? 100 : Math.floor((completed / total) * 100);
}

/** Formats a week range label such as "Jun 1-Jun 7". */
function formatWeekLabel(weekStartDate: string): string {
  const weekEndDate = addDays(weekStartDate, 6);
  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: DEFAULT_ANALYTICS_TIMEZONE,
  });

  return `${formatter.format(dateFromKey(weekStartDate))}-${formatter.format(
    dateFromKey(weekEndDate),
  )}`;
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
      dayKeys: new Set<string>(),
      activeDaysThisWeek: new Set<string>(),
      completedEventsThisWeek: 0,
      estimatedCompletionAddedThisWeek: 0,
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

    planHistory.dayKeys.add(dayKey);
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

    if (eventWeekStart === currentWeekStart) {
      planHistory.activeDaysThisWeek.add(dayKey);
      if (isCompletedEvent) {
        planHistory.completedEventsThisWeek += 1;
        planHistory.estimatedCompletionAddedThisWeek +=
          event.taskEstimatedMinutes;
      }
    }
  }

  const plans = summaries.map((summary) => {
    const planHistory = planHistoryById.get(summary.id)!;

    return {
      id: summary.id,
      topic: summary.topic,
      completedTasks: summary.completedTasks,
      totalTasks: summary.totalTasks,
      taskCompletionPercent: completionPercent(
        summary.completedTasks,
        summary.totalTasks,
      ),
      completedModules: summary.completedModules,
      totalModules: summary.moduleCount,
      completedMinutes: summary.completedMinutes,
      totalMinutes: summary.totalMinutes,
      currentStreakDays: currentStreakDays(planHistory.dayKeys, todayKey),
      activeDaysThisWeek: planHistory.activeDaysThisWeek.size,
      completedEventsThisWeek: planHistory.completedEventsThisWeek,
      estimatedCompletionAddedThisWeek:
        planHistory.estimatedCompletionAddedThisWeek,
      weeklyTrends: planHistory.weekRows.map(toWeekRow),
    };
  });

  const totals = plans.reduce(
    (acc, plan) => {
      acc.completedTasks += plan.completedTasks;
      acc.totalTasks += plan.totalTasks;
      acc.completedModules += plan.completedModules;
      acc.totalModules += plan.totalModules;
      acc.completedMinutes += plan.completedMinutes;
      acc.totalMinutes += plan.totalMinutes;
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
    planCount: plans.length,
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
      hasActivity: activityEvents.length > 0,
      currentStreakDays: currentStreakDays(globalDayKeys, todayKey),
      longestStreakDays: longestStreakDays(globalDayKeys),
      currentWeek,
      weeklyTrends,
      maxWeeklyProgressChanges: Math.max(
        1,
        ...weeklyTrends.map((row) => row.progressChangeCount),
      ),
    },
  };
}
