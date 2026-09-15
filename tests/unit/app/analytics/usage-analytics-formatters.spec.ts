import type { UsageAnalyticsModel } from '@/app/(app)/analytics/usage/usage-analytics-model';

import {
  activityEventTitle,
  buildActivityCards,
  buildCompletionCards,
  formatCompactDuration,
  formatHourAxisTick,
} from '@/app/(app)/analytics/usage/usage-analytics-formatters';
import { describe, expect, it } from 'vitest';

const emptyCurrentWeek = {
  weekStartDate: '2026-06-22',
  label: 'Jun 22-Jun 28',
  activeDays: 0,
  progressChangeCount: 0,
  completedEvents: 0,
  estimatedCompletionAddedMinutes: 0,
  isCurrentWeek: true,
} as const;

function emptyAnalyticsModel(): UsageAnalyticsModel {
  return {
    plans: [],
    completedTasks: 0,
    totalTasks: 0,
    taskCompletionPercent: 0,
    completedModules: 0,
    totalModules: 0,
    moduleCompletionPercent: 0,
    completedMinutes: 0,
    totalMinutes: 0,
    plansInProgress: 0,
    planTimeShares: [],
    analyticsTimezone: 'UTC',
    history: {
      hasActivity: false,
      currentStreakDays: 0,
      longestStreakDays: 0,
      currentWeek: emptyCurrentWeek,
      weeklyTrends: [emptyCurrentWeek],
      dailyTrends: [],
      maxWeeklyProgressChanges: 0,
    },
  };
}

describe('formatCompactDuration', () => {
  it('formats clock-style durations', () => {
    expect(formatCompactDuration(0)).toBe('0m');
    expect(formatCompactDuration(24)).toBe('24m');
    expect(formatCompactDuration(60)).toBe('1h');
    expect(formatCompactDuration(384)).toBe('6h 24m');
    expect(formatCompactDuration(-1)).toBe('—');
  });
});

describe('formatHourAxisTick', () => {
  it('labels minute values as hour ticks', () => {
    expect(formatHourAxisTick(0)).toBe('0');
    expect(formatHourAxisTick(60)).toBe('1h');
    expect(formatHourAxisTick(90)).toBe('1.5h');
  });
});

describe('activityEventTitle', () => {
  it('names recorded progress-status events without inventing study sessions', () => {
    expect(activityEventTitle('completed')).toBe('Completed a task');
    expect(activityEventTitle('in_progress')).toBe('Updated progress');
    expect(activityEventTitle('not_started')).toBe('Reset a task');
  });
});

describe('buildCompletionCards', () => {
  it('uses empty-state copy when no tasks, modules, or planned time exist', () => {
    const [tasks, modules, completedTime] = buildCompletionCards(
      emptyAnalyticsModel(),
    );

    expect(tasks).toEqual({
      label: 'Tasks',
      value: '0%',
      detail: 'No tasks tracked yet',
      comparison: 'Create a plan to track tasks',
      progress: undefined,
    });
    expect(modules).toEqual({
      label: 'Modules',
      value: '0%',
      detail: 'No modules tracked yet',
      comparison: 'Create a plan to track modules',
      progress: undefined,
    });
    expect(completedTime).toEqual({
      label: 'Completed time',
      value: '0 min',
      detail: 'Estimated completed learning time',
      comparison: 'No estimated time yet',
      progress: undefined,
    });
  });
});

describe('buildActivityCards', () => {
  it('uses empty-week copy and omits trends when no activity is recorded', () => {
    const [changes, events, activeDays, streak] = buildActivityCards(
      emptyAnalyticsModel(),
    );

    expect(changes).toEqual({
      label: 'Progress changes',
      value: '0',
      detail: 'No changes recorded this week',
      comparison: 'No change vs last week',
      status: null,
    });
    expect(events).toEqual({
      label: 'Completed events',
      value: '0',
      detail: 'No completed events this week',
      comparison: 'No change vs last week',
      status: null,
    });
    expect(activeDays).toEqual({
      label: 'Active days',
      value: '0/7',
      detail: 'No activity logged this week',
      comparison: 'No change vs last week',
      status: null,
    });
    expect(streak).toEqual({
      label: 'Streak',
      value: '0 days',
      detail: 'Best 0 days',
      comparison: 'Start with one active day',
    });
  });
});
