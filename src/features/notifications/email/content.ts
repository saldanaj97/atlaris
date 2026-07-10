import type { EmailMessage } from './types';
import type { EmailNotificationCategory } from '@/shared/types/db.types';

import {
  addDays,
  currentStreakDays,
  dateKeyInTimeZone,
  normalizeTimeZone,
  weekStartKey,
} from '@/shared/analytics/learning-activity-time';

export const STREAK_REMINDER_THRESHOLD = 3;

export type ActivityEventLike = {
  occurredAt: Date;
  status?: string;
  taskEstimatedMinutes?: number;
};

export type IncompletePlanLike = {
  id: string;
  topic: string;
  completedTasks: number;
  totalTasks: number;
};

export type EmailContentContext = {
  userId: string;
  email: string;
  analyticsTimezone: string;
  /** UTC scheduler date YYYY-MM-DD */
  schedulerDateUtc: string;
  /** Absolute now used for local-day bucketing */
  referenceDate: Date;
  activityEvents: ActivityEventLike[];
  incompletePlans: IncompletePlanLike[];
  appUrl: string;
  unsubscribeUrl: string;
};

export type BuiltEmailContent = {
  category: EmailNotificationCategory;
  deliveryKey: string;
  message: Omit<EmailMessage, 'to' | 'idempotencyKey'>;
};

function dayKeysFromEvents(
  events: ActivityEventLike[],
  timeZone: string,
): Set<string> {
  const keys = new Set<string>();
  for (const event of events) {
    keys.add(dateKeyInTimeZone(event.occurredAt, timeZone));
  }
  return keys;
}

function withFooter(
  bodyText: string,
  unsubscribeUrl: string,
): {
  text: string;
  html: string;
} {
  const footer = `You're receiving this because you opted in to Atlaris email notifications.\nUnsubscribe: ${unsubscribeUrl}`;
  const text = `${bodyText}\n\n${footer}`;
  const html = `<p>${bodyText.replaceAll('\n', '<br/>')}</p><hr/><p style="font-size:12px;color:#666">You're receiving this because you opted in to Atlaris email notifications.<br/><a href="${unsubscribeUrl}">Unsubscribe</a></p>`;
  return { text, html };
}

function listUnsubscribeHeaders(
  unsubscribeUrl: string,
): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/**
 * Prior Monday-start week relative to the user's local today.
 * Weekly email is intended for Monday scheduler runs covering that closed week.
 */
export function priorClosedWeekStartKey(todayLocalKey: string): string {
  const currentWeekStart = weekStartKey(todayLocalKey);
  return addDays(currentWeekStart, -7);
}

export function qualifyStreakReminder(args: {
  dayKeys: Set<string>;
  todayLocalKey: string;
}): { qualifies: boolean; streakDays: number } {
  if (args.dayKeys.has(args.todayLocalKey)) {
    return { qualifies: false, streakDays: 0 };
  }
  const yesterday = addDays(args.todayLocalKey, -1);
  if (!args.dayKeys.has(yesterday)) {
    return { qualifies: false, streakDays: 0 };
  }
  const streakDays = currentStreakDays(args.dayKeys, args.todayLocalKey);
  return {
    qualifies: streakDays >= STREAK_REMINDER_THRESHOLD,
    streakDays,
  };
}

export function qualifyDailyReminder(args: {
  incompletePlans: IncompletePlanLike[];
  dayKeys: Set<string>;
  todayLocalKey: string;
  streakQualifies: boolean;
}): { qualifies: boolean; plan: IncompletePlanLike | null } {
  if (args.streakQualifies) {
    return { qualifies: false, plan: null };
  }
  if (args.dayKeys.has(args.todayLocalKey)) {
    return { qualifies: false, plan: null };
  }
  const plan =
    args.incompletePlans.find(
      (p) => p.totalTasks > 0 && p.completedTasks < p.totalTasks,
    ) ?? null;
  return { qualifies: Boolean(plan), plan };
}

export function qualifyWeeklySummary(args: {
  dayKeys: Set<string>;
  priorWeekStart: string;
  schedulerDateUtc: string;
}): { qualifies: boolean; activeDays: number } {
  // ponytail: Monday-only gate uses UTC scheduler date (GHA Monday cron).
  const schedulerDate = new Date(`${args.schedulerDateUtc}T00:00:00.000Z`);
  if (schedulerDate.getUTCDay() !== 1) {
    return { qualifies: false, activeDays: 0 };
  }

  let activeDays = 0;
  for (let i = 0; i < 7; i += 1) {
    if (args.dayKeys.has(addDays(args.priorWeekStart, i))) {
      activeDays += 1;
    }
  }
  return { qualifies: activeDays > 0, activeDays };
}

export function buildEmailContents(
  ctx: EmailContentContext,
  enabledCategories: ReadonlySet<EmailNotificationCategory>,
): BuiltEmailContent[] {
  const timeZone = normalizeTimeZone(ctx.analyticsTimezone);
  const todayLocalKey = dateKeyInTimeZone(ctx.referenceDate, timeZone);
  const dayKeys = dayKeysFromEvents(ctx.activityEvents, timeZone);
  const priorWeekStart = priorClosedWeekStartKey(todayLocalKey);
  const streak = qualifyStreakReminder({
    dayKeys,
    todayLocalKey,
  });
  const daily = qualifyDailyReminder({
    incompletePlans: ctx.incompletePlans,
    dayKeys,
    todayLocalKey,
    streakQualifies: streak.qualifies,
  });
  const weekly = qualifyWeeklySummary({
    dayKeys,
    priorWeekStart,
    schedulerDateUtc: ctx.schedulerDateUtc,
  });

  const results: BuiltEmailContent[] = [];
  const headers = listUnsubscribeHeaders(ctx.unsubscribeUrl);

  if (enabledCategories.has('streak_reminder') && streak.qualifies) {
    const body = `Your ${streak.streakDays}-day learning streak is at risk. Jump back into Atlaris today to keep it going.\n\nOpen your plans: ${ctx.appUrl}/plans`;
    const { text, html } = withFooter(body, ctx.unsubscribeUrl);
    results.push({
      category: 'streak_reminder',
      deliveryKey: `${ctx.schedulerDateUtc}`,
      message: {
        subject: `Keep your ${streak.streakDays}-day streak alive`,
        text,
        html,
        headers,
      },
    });
  }

  if (
    enabledCategories.has('daily_reminder') &&
    daily.qualifies &&
    daily.plan
  ) {
    const remaining = daily.plan.totalTasks - daily.plan.completedTasks;
    const body = `You still have progress waiting on "${daily.plan.topic}" (${remaining} task${remaining === 1 ? '' : 's'} left).\n\nContinue learning: ${ctx.appUrl}/plans/${daily.plan.id}`;
    const { text, html } = withFooter(body, ctx.unsubscribeUrl);
    results.push({
      category: 'daily_reminder',
      deliveryKey: `${ctx.schedulerDateUtc}`,
      message: {
        subject: "A quick nudge for today's learning",
        text,
        html,
        headers,
      },
    });
  }

  if (enabledCategories.has('weekly_summary') && weekly.qualifies) {
    const body = `Last week you were active on ${weekly.activeDays} day${weekly.activeDays === 1 ? '' : 's'}.\n\nSee your usage analytics: ${ctx.appUrl}/analytics/usage`;
    const { text, html } = withFooter(body, ctx.unsubscribeUrl);
    results.push({
      category: 'weekly_summary',
      deliveryKey: priorWeekStart,
      message: {
        subject: 'Your weekly learning summary',
        text,
        html,
        headers,
      },
    });
  }

  return results;
}
