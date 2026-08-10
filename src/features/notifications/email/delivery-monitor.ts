import type { EmailNotificationDeliveryRunKind } from '@supabase/schema';

import * as Sentry from '@sentry/nextjs';

const EMAIL_NOTIFICATION_DELIVERY_MONITORS = {
  daily: {
    slug: 'email-notification-delivery-daily',
    config: {
      schedule: { type: 'crontab' as const, value: '0 14 * * *' },
      checkinMargin: 60,
      maxRuntime: 60,
      timezone: 'UTC',
    },
  },
  weekly: {
    slug: 'email-notification-delivery-weekly',
    config: {
      schedule: { type: 'crontab' as const, value: '30 14 * * 1' },
      checkinMargin: 60,
      maxRuntime: 60,
      timezone: 'UTC',
    },
  },
} as const;

function monitorFor(runKind: EmailNotificationDeliveryRunKind) {
  return EMAIL_NOTIFICATION_DELIVERY_MONITORS[runKind];
}

export function startEmailNotificationDeliveryMonitor(
  runKind: EmailNotificationDeliveryRunKind,
): string {
  const monitor = monitorFor(runKind);
  return Sentry.captureCheckIn(
    { monitorSlug: monitor.slug, status: 'in_progress' },
    monitor.config,
  );
}

export function finishEmailNotificationDeliveryMonitor(args: {
  runKind: EmailNotificationDeliveryRunKind;
  checkInId: string;
  status: 'ok' | 'error';
}): void {
  const monitor = monitorFor(args.runKind);
  Sentry.captureCheckIn({
    monitorSlug: monitor.slug,
    status: args.status,
    checkInId: args.checkInId,
  });
}
