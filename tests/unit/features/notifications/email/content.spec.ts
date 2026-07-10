import {
  buildEmailContents,
  priorClosedWeekStartKey,
  qualifyDailyReminder,
  qualifyStreakReminder,
  qualifyWeeklySummary,
  requiredActivityDateWindow,
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
    });
  });

  it('does not qualify streak when today already has activity', () => {
    const today = '2026-07-09';
    const dayKeys = new Set([addDays(today, -2), addDays(today, -1), today]);
    expect(
      qualifyStreakReminder({ dayKeys, todayLocalKey: today }).qualifies,
    ).toBe(false);
  });

  it('suppresses daily reminder only when streak will actually send', () => {
    const result = qualifyDailyReminder({
      incompletePlan: {
        id: 'p1',
        topic: 'TS',
        completedTasks: 1,
        totalTasks: 4,
      },
      dayKeys: new Set(),
      todayLocalKey: '2026-07-09',
      streakWillSend: true,
    });
    expect(result.qualifies).toBe(false);
  });

  it('qualifies daily reminder for incomplete plans with no activity today', () => {
    const result = qualifyDailyReminder({
      incompletePlan: {
        id: 'p1',
        topic: 'TS',
        completedTasks: 1,
        totalTasks: 4,
      },
      dayKeys: new Set(['2026-07-08']),
      todayLocalKey: '2026-07-09',
      streakWillSend: false,
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

  it('buildEmailContents prefers streak over daily when both enabled and includes unsubscribe headers', () => {
    const today = '2026-07-09';
    const contents = buildEmailContents(
      {
        userId: 'u1',
        email: 'u@example.com',
        analyticsTimezone: 'UTC',
        schedulerDateUtc: today,
        referenceDate: day(today),
        activityDayKeys: [
          addDays(today, -3),
          addDays(today, -2),
          addDays(today, -1),
        ],
        incompletePlan: {
          id: 'p1',
          topic: 'TS',
          completedTasks: 1,
          totalTasks: 4,
        },
        appUrl: 'https://atlaris.app',
        unsubscribeUrl: 'https://atlaris.app/unsub',
      },
      new Set(['daily_reminder', 'streak_reminder', 'weekly_summary']),
    );

    expect(contents.map((c) => c.category)).toEqual(['streak_reminder']);
    expect(contents[0]?.message.subject).toBe(
      'Keep your learning streak alive',
    );
    expect(contents[0]?.message.headers?.['List-Unsubscribe']).toContain(
      'https://atlaris.app/unsub',
    );
  });

  it('sends daily only when streak is preference-disabled even if streak would qualify', () => {
    const today = '2026-07-09';
    const contents = buildEmailContents(
      {
        userId: 'u1',
        email: 'u@example.com',
        analyticsTimezone: 'UTC',
        schedulerDateUtc: today,
        referenceDate: day(today),
        activityDayKeys: [
          addDays(today, -3),
          addDays(today, -2),
          addDays(today, -1),
        ],
        incompletePlan: {
          id: 'p1',
          topic: 'TS',
          completedTasks: 1,
          totalTasks: 4,
        },
        appUrl: 'https://atlaris.app',
        unsubscribeUrl: 'https://atlaris.app/unsub',
      },
      new Set(['daily_reminder']),
    );

    expect(contents.map((c) => c.category)).toEqual(['daily_reminder']);
  });

  it('builds a bounded activity window for weekly-only and streak-only categories', () => {
    const today = '2026-07-13';
    expect(
      requiredActivityDateWindow({
        todayLocalKey: today,
        enabledCategories: new Set(['weekly_summary']),
      }),
    ).toEqual({
      startDateKeyInclusive: '2026-07-06',
      endDateKeyExclusive: '2026-07-13',
    });

    expect(
      requiredActivityDateWindow({
        todayLocalKey: today,
        enabledCategories: new Set(['streak_reminder']),
      }),
    ).toEqual({
      startDateKeyInclusive: addDays(today, -STREAK_REMINDER_THRESHOLD),
      endDateKeyExclusive: addDays(today, 1),
    });
  });
});
