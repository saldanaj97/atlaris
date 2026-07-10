import type { EmailSender } from '@/features/notifications/email/types';

import { runEmailNotificationDelivery } from '@/features/notifications/email/delivery-service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listRecipients = vi.hoisted(() => vi.fn());
const getPrefs = vi.hoisted(() => vi.fn());
const getUserPrefs = vi.hoisted(() => vi.fn());
const getEvents = vi.hoisted(() => vi.fn());
const claim = vi.hoisted(() => vi.fn());
const markSent = vi.hoisted(() => vi.fn());
const markFailed = vi.hoisted(() => vi.fn());
const markSkipped = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db/queries/email-delivery-recipients', () => ({
  listEmailDeliveryRecipients: listRecipients,
}));

vi.mock('@/lib/db/queries/user-preferences', () => ({
  getEmailNotificationPreferences: getPrefs,
  getUserPreferences: getUserPrefs,
}));

vi.mock('@/lib/db/queries/tasks', () => ({
  getLearningActivityEventsForUser: getEvents,
}));

vi.mock('@/lib/db/queries/email-notification-deliveries', () => ({
  claimEmailNotificationDelivery: claim,
  markEmailNotificationDeliverySent: markSent,
  markEmailNotificationDeliveryFailed: markFailed,
  markEmailNotificationDeliverySkipped: markSkipped,
}));

vi.mock('@/lib/observability/metrics', () => ({
  countMetric: vi.fn(),
}));

function fakeDb() {
  return {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          leftJoin: () => ({
            leftJoin: () => ({
              where: () => ({
                groupBy: async () => [
                  {
                    id: 'plan-1',
                    topic: 'TypeScript',
                    totalTasks: 4,
                    completedTasks: 1,
                  },
                ],
              }),
            }),
          }),
        }),
      }),
    }),
  };
}

describe('runEmailNotificationDelivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listRecipients.mockResolvedValue({
      recipients: [{ userId: 'u1', email: 'u@example.com' }],
      nextCursor: null,
    });
    getPrefs.mockResolvedValue({
      unsubscribeAllOptionalEmails: false,
      categories: {
        weekly_summary: false,
        daily_reminder: true,
        streak_reminder: true,
      },
    });
    getUserPrefs.mockResolvedValue({
      preferredAiModel: null,
      analyticsTimezone: 'UTC',
    });
    getEvents.mockResolvedValue([
      { occurredAt: new Date('2026-07-06T12:00:00.000Z') },
      { occurredAt: new Date('2026-07-07T12:00:00.000Z') },
      { occurredAt: new Date('2026-07-08T12:00:00.000Z') },
    ]);
    claim.mockResolvedValue({ outcome: 'claimed', deliveryId: 'd1' });
    markSent.mockResolvedValue(undefined);
  });

  it('sends streak reminder with fake sender and skips daily when streak wins', async () => {
    const sender: EmailSender = {
      send: vi.fn().mockResolvedValue({ providerMessageId: 're_1' }),
    };

    const result = await runEmailNotificationDelivery(
      {
        categories: ['daily_reminder', 'streak_reminder'],
        schedulerDateUtc: '2026-07-09',
      },
      {
        db: fakeDb() as never,
        sender,
        unsubscribeSecret: 'secret',
        appUrl: 'https://atlaris.app',
        now: new Date('2026-07-09T15:00:00.000Z'),
      },
    );

    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sender.send).mock.calls[0]?.[0].subject).toMatch(
      /streak/i,
    );
    expect(result.sent).toBe(1);
    expect(result.claimed).toBe(1);
    expect(markSent).toHaveBeenCalledWith('d1', 're_1', expect.anything());
  });

  it('does not send when preferences resolve to off', async () => {
    getPrefs.mockResolvedValue({
      unsubscribeAllOptionalEmails: true,
      categories: {
        weekly_summary: true,
        daily_reminder: true,
        streak_reminder: true,
      },
    });
    const sender: EmailSender = { send: vi.fn() };

    const result = await runEmailNotificationDelivery(
      {
        categories: ['daily_reminder'],
        schedulerDateUtc: '2026-07-09',
      },
      {
        db: fakeDb() as never,
        sender,
        unsubscribeSecret: 'secret',
        now: new Date('2026-07-09T15:00:00.000Z'),
      },
    );

    expect(sender.send).not.toHaveBeenCalled();
    expect(result.examined).toBe(1);
    expect(result.sent).toBe(0);
  });
});
