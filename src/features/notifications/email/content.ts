import type { EmailMessage } from './types';
import type { EmailNotificationCategory } from '@/shared/types/db.types';

import {
  addDays,
  dateKeyInTimeZone,
  normalizeTimeZone,
  weekStartKey,
} from '@/shared/analytics/learning-activity-time';

export const STREAK_REMINDER_THRESHOLD = 3;

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
  /** Distinct local YYYY-MM-DD activity day keys in the required window */
  activityDayKeys: ReadonlySet<string> | readonly string[];
  incompletePlan: IncompletePlanLike | null;
  appUrl: string;
  unsubscribeUrl: string;
};

export type BuiltEmailContent = {
  category: EmailNotificationCategory;
  deliveryKey: string;
  message: Omit<EmailMessage, 'to' | 'idempotencyKey'>;
};

export type EmailContentDateWindow = {
  startDateKeyInclusive: string;
  endDateKeyExclusive: string;
};

function asDayKeySet(
  dayKeys: ReadonlySet<string> | readonly string[],
): Set<string> {
  return dayKeys instanceof Set ? dayKeys : new Set(dayKeys);
}

/** Escapes text content only. Use escapeHtmlAttribute for HTML attributes. */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
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
  const html = `<p>${escapeHtml(bodyText).replaceAll('\n', '<br/>')}</p><hr/><p style="font-size:12px;color:#666">You're receiving this because you opted in to Atlaris email notifications.<br/><a href="${escapeHtmlAttribute(unsubscribeUrl)}">Unsubscribe</a></p>`;
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

/**
 * Smallest local date window needed for the enabled categories.
 * End key is exclusive.
 */
export function requiredActivityDateWindow(args: {
  todayLocalKey: string;
  enabledCategories: ReadonlySet<EmailNotificationCategory>;
}): EmailContentDateWindow | null {
  const starts: string[] = [];
  const ends: string[] = [];

  if (args.enabledCategories.has('daily_reminder')) {
    starts.push(args.todayLocalKey);
    ends.push(addDays(args.todayLocalKey, 1));
  }

  if (args.enabledCategories.has('streak_reminder')) {
    // Need threshold consecutive days ending yesterday (today idle).
    starts.push(addDays(args.todayLocalKey, -STREAK_REMINDER_THRESHOLD));
    ends.push(addDays(args.todayLocalKey, 1));
  }

  if (args.enabledCategories.has('weekly_summary')) {
    const priorWeekStart = priorClosedWeekStartKey(args.todayLocalKey);
    starts.push(priorWeekStart);
    ends.push(addDays(priorWeekStart, 7));
  }

  if (starts.length === 0) {
    return null;
  }

  return {
    startDateKeyInclusive: starts.reduce((min, key) => (key < min ? key : min)),
    endDateKeyExclusive: ends.reduce((max, key) => (key > max ? key : max)),
  };
}

export function qualifyStreakReminder(args: {
  dayKeys: Set<string>;
  todayLocalKey: string;
}): { qualifies: boolean } {
  if (args.dayKeys.has(args.todayLocalKey)) {
    return { qualifies: false };
  }
  const yesterday = addDays(args.todayLocalKey, -1);
  if (!args.dayKeys.has(yesterday)) {
    return { qualifies: false };
  }

  // Bounded window only proves "at least threshold days", not lifetime streak.
  for (let i = 1; i <= STREAK_REMINDER_THRESHOLD; i += 1) {
    if (!args.dayKeys.has(addDays(args.todayLocalKey, -i))) {
      return { qualifies: false };
    }
  }
  return { qualifies: true };
}

export function qualifyDailyReminder(args: {
  incompletePlan: IncompletePlanLike | null;
  dayKeys: Set<string>;
  todayLocalKey: string;
}): { qualifies: boolean; plan: IncompletePlanLike | null } {
  if (args.dayKeys.has(args.todayLocalKey)) {
    return { qualifies: false, plan: null };
  }
  const plan = args.incompletePlan;
  if (
    !plan ||
    !(plan.totalTasks > 0 && plan.completedTasks < plan.totalTasks)
  ) {
    return { qualifies: false, plan: null };
  }
  return { qualifies: true, plan };
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
  const dayKeys = asDayKeySet(ctx.activityDayKeys);
  const priorWeekStart = priorClosedWeekStartKey(todayLocalKey);
  const streak = qualifyStreakReminder({
    dayKeys,
    todayLocalKey,
  });
  const streakQualifies =
    enabledCategories.has('streak_reminder') && streak.qualifies;
  const daily = qualifyDailyReminder({
    incompletePlan: ctx.incompletePlan,
    dayKeys,
    todayLocalKey,
  });
  const weekly = qualifyWeeklySummary({
    dayKeys,
    priorWeekStart,
    schedulerDateUtc: ctx.schedulerDateUtc,
  });

  const results: BuiltEmailContent[] = [];
  const headers = listUnsubscribeHeaders(ctx.unsubscribeUrl);

  // Delivery is sequential: a sent streak reminder must precede daily reminder
  // processing so the latter can be suppressed in the same pass.
  if (streakQualifies) {
    const body = `Your learning streak of at least ${STREAK_REMINDER_THRESHOLD} days is at risk. Jump back into Atlaris today to keep it going.\n\nOpen your plans: ${ctx.appUrl}/plans`;
    const { text, html } = withFooter(body, ctx.unsubscribeUrl);
    results.push({
      category: 'streak_reminder',
      deliveryKey: `${ctx.schedulerDateUtc}`,
      message: {
        subject: 'Keep your learning streak alive',
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
