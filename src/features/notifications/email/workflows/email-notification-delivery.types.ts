import type { EmailNotificationCategory } from '@/shared/types/db.types';
import type { EmailNotificationDeliveryRunKind } from '@supabase/schema';

export type EmailNotificationDeliveryRunAction =
  | 'start'
  | 'resume'
  | 'replay_reviewed';

type EmailNotificationDeliveryRunDefinition = {
  readonly categories: readonly EmailNotificationCategory[];
  readonly referenceTimeUtc: string;
};

const EMAIL_NOTIFICATION_DELIVERY_RUN_DEFINITIONS = {
  daily: {
    categories: ['daily_reminder', 'streak_reminder'],
    referenceTimeUtc: '14:00:00.000Z',
  },
  weekly: {
    categories: ['weekly_summary'],
    referenceTimeUtc: '14:30:00.000Z',
  },
} as const satisfies Record<
  EmailNotificationDeliveryRunKind,
  EmailNotificationDeliveryRunDefinition
>;

export function getEmailNotificationDeliveryRunDefinition(
  runKind: EmailNotificationDeliveryRunKind,
): EmailNotificationDeliveryRunDefinition {
  return EMAIL_NOTIFICATION_DELIVERY_RUN_DEFINITIONS[runKind];
}

function parseEmailNotificationDeliverySchedulerDate(
  schedulerDateUtc: string,
): Date {
  const date = new Date(`${schedulerDateUtc}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== schedulerDateUtc
  ) {
    throw new Error('Invalid email notification delivery scheduler date');
  }
  return date;
}

export function createEmailNotificationDeliveryReferenceTimestamp(
  runKind: EmailNotificationDeliveryRunKind,
  schedulerDateUtc: string,
): Date {
  parseEmailNotificationDeliverySchedulerDate(schedulerDateUtc);
  const referenceTimestamp = new Date(
    `${schedulerDateUtc}T${getEmailNotificationDeliveryRunDefinition(runKind).referenceTimeUtc}`,
  );
  if (Number.isNaN(referenceTimestamp.getTime())) {
    throw new Error('Invalid email notification delivery scheduler date');
  }
  return referenceTimestamp;
}

export function isEmailNotificationDeliveryWeeklyDate(
  schedulerDateUtc: string,
): boolean {
  return (
    parseEmailNotificationDeliverySchedulerDate(
      schedulerDateUtc,
    ).getUTCDay() === 1
  );
}

export function getEmailNotificationDeliveryLedgerKeys(
  runKind: EmailNotificationDeliveryRunKind,
  schedulerDateUtc: string,
): readonly string[] {
  if (runKind === 'daily') {
    return [schedulerDateUtc];
  }

  const schedulerDate =
    parseEmailNotificationDeliverySchedulerDate(schedulerDateUtc);
  schedulerDate.setUTCDate(schedulerDate.getUTCDate() - 7);
  return [schedulerDate.toISOString().slice(0, 10)];
}
