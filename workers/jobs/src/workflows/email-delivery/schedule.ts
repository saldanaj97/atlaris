import type { EmailNotificationDeliveryRunKind } from '@supabase/schema';

import { isEmailNotificationDeliveryWeeklyDate } from '@/features/notifications/email/workflows/email-notification-delivery.types';

/**
 * Workflow `schedules` for the email Workflow. Cloudflare numbers weekdays
 * from 1 = Sunday, so Monday is written `MON` (design note, Decision 8).
 */
export const EMAIL_DELIVERY_SCHEDULES = {
  daily: '0 14 * * *',
  weekly: '30 14 * * MON',
} as const satisfies Record<EmailNotificationDeliveryRunKind, string>;

export type ScheduledEmailDeliveryRun = {
  runKind: EmailNotificationDeliveryRunKind;
  schedulerDateUtc: string;
};

/**
 * Maps a Workflow schedule firing to its logical run. Returns null for an
 * unknown expression, or a weekly firing whose UTC date is not a Monday.
 */
export function resolveScheduledEmailDeliveryRun(schedule: {
  cron: string;
  scheduledTime: number;
}): ScheduledEmailDeliveryRun | null {
  const runKind = (
    Object.keys(EMAIL_DELIVERY_SCHEDULES) as EmailNotificationDeliveryRunKind[]
  ).find((kind) => EMAIL_DELIVERY_SCHEDULES[kind] === schedule.cron);
  if (!runKind) {
    return null;
  }

  const schedulerDateUtc = new Date(schedule.scheduledTime)
    .toISOString()
    .slice(0, 10);
  if (
    runKind === 'weekly' &&
    !isEmailNotificationDeliveryWeeklyDate(schedulerDateUtc)
  ) {
    return null;
  }
  return { runKind, schedulerDateUtc };
}
