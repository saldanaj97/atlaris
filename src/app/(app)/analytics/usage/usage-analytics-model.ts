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

export type UsageAnalyticsDayRow = {
  dateKey: string;
  label: string;
  progressChangeCount: number;
  completedEvents: number;
  estimatedCompletionAddedMinutes: number;
};

export type UsageAnalyticsPlanRow = {
  id: string;
  topic: string;
  weeklyTrends: UsageAnalyticsWeekRow[];
};

export type UsageAnalyticsPlanTimeShare = {
  id: string;
  topic: string;
  completedMinutes: number;
  percent: number;
};

export type UsageAnalyticsRecentEvent = {
  id: string;
  planId: string;
  planTopic: string;
  status: ProgressStatus;
  occurredAt: Date;
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
  plansInProgress: number;
  planTimeShares: UsageAnalyticsPlanTimeShare[];
  recentEvents: UsageAnalyticsRecentEvent[];
  analyticsTimezone: string;
  history: {
    hasActivity: boolean;
    currentStreakDays: number;
    longestStreakDays: number;
    currentWeek: UsageAnalyticsWeekRow;
    weeklyTrends: UsageAnalyticsWeekRow[];
    dailyTrends: UsageAnalyticsDayRow[];
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
  weekRows: MutableWeekRow[];
  weekRowsByStart: Map<string, MutableWeekRow>;
};

const WEEK_TREND_COUNT = 8;
const DAILY_TREND_COUNT = 30;
const RECENT_EVENT_COUNT = 4;
const NAMED_PLAN_TIME_SHARE_LIMIT = 4;
const WEEK_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: DEFAULT_ANALYTICS_TIMEZONE,
});
const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: DEFAULT_ANALYTICS_TIMEZONE,
});

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

/** Builds empty daily trend rows ending at the reference day. */
function buildDayRows(todayKey: string): UsageAnalyticsDayRow[] {
  return Array.from({ length: DAILY_TREND_COUNT }, (_, index) => {
    const dateKey = addDays(todayKey, index - DAILY_TREND_COUNT + 1);

    return {
      dateKey,
      label: DAY_LABEL_FORMATTER.format(dateFromKey(dateKey)),
      progressChangeCount: 0,
      completedEvents: 0,
      estimatedCompletionAddedMinutes: 0,
    };
  });
}

/** Groups current-state completed minutes by plan, collapsing overflow into Other. */
function buildPlanTimeShares(
  summaries: LightweightPlanSummary[],
  completedMinutes: number,
): UsageAnalyticsPlanTimeShare[] {
  const ranked = summaries
    .filter((summary) => summary.completedMinutes > 0)
    .toSorted((left, right) => right.completedMinutes - left.completedMinutes);
  const named = ranked.slice(0, NAMED_PLAN_TIME_SHARE_LIMIT);
  const overflowMinutes = ranked
    .slice(NAMED_PLAN_TIME_SHARE_LIMIT)
    .reduce((sum, summary) => sum + summary.completedMinutes, 0);

  const shares: UsageAnalyticsPlanTimeShare[] = named.map((summary) => ({
    id: summary.id,
    topic: summary.topic,
    completedMinutes: summary.completedMinutes,
    percent: sharePercent(summary.completedMinutes, completedMinutes),
  }));

  if (overflowMinutes > 0) {
    shares.push({
      id: 'other',
      topic: 'Other',
      completedMinutes: overflowMinutes,
      percent: sharePercent(overflowMinutes, completedMinutes),
    });
  }

  return shares;
}

/** Returns a 0–100 share, rounded, for a part of a completed-time total. */
function sharePercent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
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
  const dayRows = buildDayRows(todayKey);
  const dayRowsByKey = new Map(dayRows.map((row) => [row.dateKey, row]));
  const globalDayKeys = new Set<string>();
  const planHistoryById = new Map<string, MutablePlanHistory>();
  const planTopicById = new Map(
    summaries.map((summary) => [summary.id, summary.topic]),
  );

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

    const dayRow = dayRowsByKey.get(dayKey);
    if (dayRow) {
      dayRow.progressChangeCount += 1;
      if (isCompletedEvent) {
        dayRow.completedEvents += 1;
        dayRow.estimatedCompletionAddedMinutes += event.taskEstimatedMinutes;
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

  const recentEvents = [...activityEvents]
    .toSorted(
      (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
    )
    .slice(0, RECENT_EVENT_COUNT)
    .map((event, index) => ({
      id: `${event.planId}-${event.occurredAt.toISOString()}-${index}`,
      planId: event.planId,
      planTopic: planTopicById.get(event.planId) ?? 'Untitled plan',
      status: event.status,
      occurredAt: event.occurredAt,
    }));

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
    plansInProgress: summaries.filter(
      (summary) =>
        summary.totalTasks > 0 && summary.completedTasks < summary.totalTasks,
    ).length,
    planTimeShares: buildPlanTimeShares(summaries, totals.completedMinutes),
    recentEvents,
    analyticsTimezone,
    history: {
      hasActivity: activityEvents.length > 0,
      currentStreakDays: currentStreakDays(globalDayKeys, todayKey),
      longestStreakDays: longestStreakDays(globalDayKeys),
      currentWeek,
      weeklyTrends,
      dailyTrends: dayRows,
      maxWeeklyProgressChanges: Math.max(
        1,
        ...weeklyTrends.map((row) => row.progressChangeCount),
      ),
    },
  };
}
