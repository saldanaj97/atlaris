import {
  createEmailNotificationDeliveryReferenceTimestamp,
  getEmailNotificationDeliveryLedgerKeys,
  resolveEmailNotificationDeliveryRunKind,
} from '@/features/notifications/email/workflows/email-notification-delivery.types';
import { describe, expect, it } from 'vitest';

describe('email notification delivery workflow types', () => {
  it('maps only the configured Vercel schedules to their code-owned run kinds', () => {
    expect(resolveEmailNotificationDeliveryRunKind('0 14 * * *')).toBe('daily');
    expect(resolveEmailNotificationDeliveryRunKind('30 14 * * 1')).toBe(
      'weekly',
    );
    expect(resolveEmailNotificationDeliveryRunKind('0 0 * * *')).toBeNull();
  });

  it('pins the logical reference timestamp to the requested UTC schedule time', () => {
    expect(
      createEmailNotificationDeliveryReferenceTimestamp('daily', '2026-07-10'),
    ).toEqual(new Date('2026-07-10T14:00:00.000Z'));
    expect(
      createEmailNotificationDeliveryReferenceTimestamp('weekly', '2026-07-13'),
    ).toEqual(new Date('2026-07-13T14:30:00.000Z'));
    expect(() =>
      createEmailNotificationDeliveryReferenceTimestamp('daily', '2026-02-31'),
    ).toThrow('Invalid email notification delivery scheduler date');
  });

  it('uses the same deterministic ledger key scope when finalizing a run', () => {
    expect(
      getEmailNotificationDeliveryLedgerKeys('daily', '2026-07-10'),
    ).toEqual(['2026-07-10']);
    expect(
      getEmailNotificationDeliveryLedgerKeys('weekly', '2026-07-13'),
    ).toEqual(['2026-07-06']);
  });
});
