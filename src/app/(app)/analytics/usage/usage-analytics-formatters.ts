import type { UsageAnalyticsModel } from './usage-analytics-model';
import type { ProgressStatus } from '@/shared/types/db.types';

import { formatMinutes } from '@/features/plans/formatters';

export type UsageAnalyticsMetricTrend = {
  label: 'Up' | 'Down' | 'Flat';
  icon: 'up' | 'down' | 'flat';
};

export type UsageAnalyticsCompletionCard = {
  label: 'Tasks' | 'Modules' | 'Completed time';
  value: string;
  detail: string;
  comparison: string;
  progress?: number;
};

export type UsageAnalyticsActivityCard = {
  label: 'Progress changes' | 'Completed events' | 'Active days' | 'Streak';
  value: string;
  detail: string;
  comparison: string;
  status?: UsageAnalyticsMetricTrend | null;
};

/** Formats minutes as a compact clock value such as 6h 24m. */
export function formatCompactDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) {
    return '—';
  }

  const wholeMinutes = Math.round(minutes);
  const hours = Math.floor(wholeMinutes / 60);
  const remainingMinutes = wholeMinutes % 60;

  if (hours === 0) {
    return `${remainingMinutes}m`;
  }

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

/** Formats a Y-axis tick for estimated minutes as 0 / 1h / 2h. */
export function formatHourAxisTick(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '0';
  }

  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

/** Returns the honest activity-row title for a recorded progress-status event. */
export function activityEventTitle(status: ProgressStatus): string {
  switch (status) {
    case 'completed':
      return 'Completed a task';
    case 'in_progress':
      return 'Updated progress';
    case 'not_started':
      return 'Reset a task';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

/** Formats a day count with correct singular or plural labeling. */
export function formatDayCount(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** Returns a human-readable label for remaining tasks or modules. */
export function remainingLabel(remaining: number, noun: string): string {
  const safeRemaining = Math.max(0, remaining);

  if (safeRemaining === 0) {
    return 'Nothing left';
  }

  return `${safeRemaining} ${safeRemaining === 1 ? noun : `${noun}s`} left`;
}

/** Compares current and previous values to produce a visible trend. */
export function activityStatus(
  current: number,
  previous: number,
): UsageAnalyticsMetricTrend | null {
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
export function formatCountDelta(
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
export function streakComparison(current: number, longest: number): string {
  if (current === 0 && longest === 0) {
    return 'Start with one active day';
  }

  if (current >= longest) {
    return 'Matches your best run';
  }

  const remaining = longest - current;
  return `${remaining} ${remaining === 1 ? 'day' : 'days'} from best`;
}

/** Builds the three current-completion metric cards from live plan totals. */
export function buildCompletionCards(
  model: UsageAnalyticsModel,
): UsageAnalyticsCompletionCard[] {
  return [
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
      progress:
        model.totalMinutes > 0
          ? Math.min(100, (model.completedMinutes / model.totalMinutes) * 100)
          : undefined,
    },
  ];
}

/** Builds the four this-week activity metric cards from recorded history. */
export function buildActivityCards(
  model: UsageAnalyticsModel,
): UsageAnalyticsActivityCard[] {
  const currentWeek = model.history.currentWeek;
  const previousWeek = model.history.weeklyTrends.at(-2) ?? null;

  return [
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
    },
    {
      label: 'Streak',
      value: formatDayCount(model.history.currentStreakDays),
      detail: `Best ${formatDayCount(model.history.longestStreakDays)}`,
      comparison: streakComparison(
        model.history.currentStreakDays,
        model.history.longestStreakDays,
      ),
    },
  ];
}
