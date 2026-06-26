import type { LightweightPlanSummary } from '@/shared/types/db.types';

type ActivityStatus = 'not_started' | 'in_progress' | 'completed';

export type UsageAnalyticsActivityEvent = {
  planId: string;
  status: ActivityStatus;
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
};

const DEFAULT_ANALYTICS_TIMEZONE = 'UTC';
const WEEK_TREND_COUNT = 8;

function completionPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return completed >= total ? 100 : Math.floor((completed / total) * 100);
}

function normalizeTimeZone(value: string | undefined): string {
  if (!value) return DEFAULT_ANALYTICS_TIMEZONE;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
    return value;
  } catch {
    return DEFAULT_ANALYTICS_TIMEZONE;
  }
}

function dateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('Unable to format analytics date key');
  }

  return `${year}-${month}-${day}`;
}

function dateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(dateKey: string, days: number): string {
  const date = dateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekStartKey(dateKey: string): string {
  const date = dateFromKey(dateKey);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

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

function currentStreakDays(dayKeys: Set<string>, todayKey: string): number {
  let cursor = dayKeys.has(todayKey) ? todayKey : addDays(todayKey, -1);
  let streak = 0;

  while (dayKeys.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

function longestStreakDays(dayKeys: Set<string>): number {
  let longest = 0;
  let current = 0;
  let previous: string | null = null;

  for (const dayKey of [...dayKeys].sort()) {
    current = previous && dayKey === addDays(previous, 1) ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = dayKey;
  }

  return longest;
}

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
    planHistoryById.set(summary.id, {
      dayKeys: new Set<string>(),
      activeDaysThisWeek: new Set<string>(),
      completedEventsThisWeek: 0,
      estimatedCompletionAddedThisWeek: 0,
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
    if (eventWeekStart === currentWeekStart) {
      planHistory.activeDaysThisWeek.add(dayKey);
      if (isCompletedEvent) {
        planHistory.completedEventsThisWeek += 1;
        planHistory.estimatedCompletionAddedThisWeek +=
          event.taskEstimatedMinutes;
      }
    }
  }

  const plans = summaries.map((summary) => ({
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
    currentStreakDays: currentStreakDays(
      planHistoryById.get(summary.id)?.dayKeys ?? new Set<string>(),
      todayKey,
    ),
    activeDaysThisWeek:
      planHistoryById.get(summary.id)?.activeDaysThisWeek.size ?? 0,
    completedEventsThisWeek:
      planHistoryById.get(summary.id)?.completedEventsThisWeek ?? 0,
    estimatedCompletionAddedThisWeek:
      planHistoryById.get(summary.id)?.estimatedCompletionAddedThisWeek ?? 0,
  }));

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

  const weeklyTrends = weekRows.map((row) => ({
    weekStartDate: row.weekStartDate,
    label: row.label,
    activeDays: row.activeDayKeys.size,
    progressChangeCount: row.progressChangeCount,
    completedEvents: row.completedEvents,
    estimatedCompletionAddedMinutes: row.estimatedCompletionAddedMinutes,
    isCurrentWeek: row.isCurrentWeek,
  }));
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
