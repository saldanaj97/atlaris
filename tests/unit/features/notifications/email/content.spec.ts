import {
  buildEmailContents,
  priorClosedWeekStartKey,
  qualifyDailyReminder,
  qualifyStreakReminder,
  qualifyWeeklySummary,
  STREAK_REMINDER_THRESHOLD,
} from '@/features/notifications/email/content';
import { addDays } from '@/shared/analytics/learning-activity-time';
import { describe, expect, it } from 'vitest';

function day(isoDate: string): Date {
  return new Date(`${isoDate}T18:00:00.000Z`);
}

describe('email content eligibility', () => {
  it(`qualifies streak when yesterday continues a ${STREAK_REMINDER_THRESHOLD}+ day streak and today is idle`, () => {
    const today = '2026-07-09';
    const dayKeys = new Set([
      addDays(today, -3),
      addDays(today, -2),
      addDays(today, -1),
    ]);
    expect(qualifyStreakReminder({ dayKeys, todayLocalKey: today })).toEqual({
      qualifies: true,
      streakDays: 3,
    });
  });

  it('does not qualify streak when today already has activity', () => {
    const today = '2026-07-09';
    const dayKeys = new Set([addDays(today, -2), addDays(today, -1), today]);
    expect(
      qualifyStreakReminder({ dayKeys, todayLocalKey: today }).qualifies,
    ).toBe(false);
  });

  it('suppresses daily reminder when streak also qualifies', () => {
    const result = qualifyDailyReminder({
      incompletePlans: [
        { id: 'p1', topic: 'TS', completedTasks: 1, totalTasks: 4 },
      ],
      dayKeys: new Set(),
      todayLocalKey: '2026-07-09',
      streakQualifies: true,
    });
    expect(result.qualifies).toBe(false);
  });

  it('qualifies daily reminder for incomplete plans with no activity today', () => {
    const result = qualifyDailyReminder({
      incompletePlans: [
        { id: 'p1', topic: 'TS', completedTasks: 1, totalTasks: 4 },
      ],
      dayKeys: new Set(['2026-07-08']),
      todayLocalKey: '2026-07-09',
      streakQualifies: false,
    });
    expect(result.qualifies).toBe(true);
    expect(result.plan?.id).toBe('p1');
  });

  it('weekly summary only on Monday UTC scheduler date for prior week with activity', () => {
    const today = '2026-07-13'; // Monday
    const priorWeekStart = priorClosedWeekStartKey(today);
    expect(priorWeekStart).toBe('2026-07-06');

    expect(
      qualifyWeeklySummary({
        dayKeys: new Set(['2026-07-07']),
        priorWeekStart,
        schedulerDateUtc: '2026-07-13',
      }).qualifies,
    ).toBe(true);

    expect(
      qualifyWeeklySummary({
        dayKeys: new Set(['2026-07-07']),
        priorWeekStart,
        schedulerDateUtc: '2026-07-14',
      }).qualifies,
    ).toBe(false);
  });

  it('buildEmailContents prefers streak over daily and includes unsubscribe headers', () => {
    const today = '2026-07-09';
    const contents = buildEmailContents(
      {
        userId: 'u1',
        email: 'u@example.com',
        analyticsTimezone: 'UTC',
        schedulerDateUtc: today,
        referenceDate: day(today),
        activityEvents: [
          { occurredAt: day(addDays(today, -3)) },
          { occurredAt: day(addDays(today, -2)) },
          { occurredAt: day(addDays(today, -1)) },
        ],
        incompletePlans: [
          { id: 'p1', topic: 'TS', completedTasks: 1, totalTasks: 4 },
        ],
        appUrl: 'https://atlaris.app',
        unsubscribeUrl: 'https://atlaris.app/unsub',
      },
      new Set(['daily_reminder', 'streak_reminder', 'weekly_summary']),
    );

    expect(contents.map((c) => c.category)).toEqual(['streak_reminder']);
    expect(contents[0]?.message.headers?.['List-Unsubscribe']).toContain(
      'https://atlaris.app/unsub',
    );
  });
});
