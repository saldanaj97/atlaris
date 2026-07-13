import type { EmailNotificationCategory } from '@/shared/types/db.types';
import type { EmailNotificationDeliveryRunKind } from '@supabase/schema';

export type EmailNotificationDeliveryWorkflowInput = {
  readonly runId: string;
};

export type EmailNotificationDeliveryWorkflowClaimResult =
  | { readonly kind: 'claimed' }
  | { readonly kind: 'in_flight' }
  | { readonly kind: 'terminal' };

export type EmailNotificationDeliveryWorkflowPageResult =
  | { readonly kind: 'page_processed'; readonly nextCursor: string | null }
  | { readonly kind: 'in_flight' }
  | { readonly kind: 'paused' };

export type EmailNotificationDeliveryWorkflowTerminalResult =
  | { readonly kind: 'completed' }
  | { readonly kind: 'needs_review' }
  | { readonly kind: 'in_flight' };

export type EmailNotificationDeliveryWorkflowResult =
  | EmailNotificationDeliveryWorkflowClaimResult
  | EmailNotificationDeliveryWorkflowPageResult
  | EmailNotificationDeliveryWorkflowTerminalResult;

export type EmailNotificationDeliveryRunAction =
  | 'start'
  | 'resume'
  | 'replay_reviewed';

type EmailNotificationDeliveryRunDefinition = {
  readonly categories: readonly EmailNotificationCategory[];
  readonly schedule: string;
  readonly referenceTimeUtc: string;
};

const EMAIL_NOTIFICATION_DELIVERY_RUN_DEFINITIONS = {
  daily: {
    categories: ['daily_reminder', 'streak_reminder'],
    schedule: '0 14 * * *',
    referenceTimeUtc: '14:00:00.000Z',
  },
  weekly: {
    categories: ['weekly_summary'],
    schedule: '30 14 * * 1',
    referenceTimeUtc: '14:30:00.000Z',
  },
} as const satisfies Record<
  EmailNotificationDeliveryRunKind,
  EmailNotificationDeliveryRunDefinition
>;

export function resolveEmailNotificationDeliveryRunKind(
  schedule: string,
): EmailNotificationDeliveryRunKind | null {
  for (const [runKind, definition] of Object.entries(
    EMAIL_NOTIFICATION_DELIVERY_RUN_DEFINITIONS,
  ) as Array<
    [EmailNotificationDeliveryRunKind, EmailNotificationDeliveryRunDefinition]
  >) {
    if (definition.schedule === schedule) {
      return runKind;
    }
  }
  return null;
}

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
