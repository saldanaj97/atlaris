import type {
  EmailSender,
  PersistedProviderRequest,
} from '@/features/notifications/email/types';

import { runEmailNotificationDelivery } from '@/features/notifications/email/delivery-service';
import { EmailProviderError } from '@/features/notifications/email/resend-adapter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listRecipients = vi.hoisted(() => vi.fn());
const getPrefs = vi.hoisted(() => vi.fn());
const getUserPrefs = vi.hoisted(() => vi.fn());
const listDayKeys = vi.hoisted(() => vi.fn());
const findPlan = vi.hoisted(() => vi.fn());
const claim = vi.hoisted(() => vi.fn());
const markSent = vi.hoisted(() => vi.fn());
const markFailed = vi.hoisted(() => vi.fn());
const markManualReview = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db/queries/email-delivery-recipients', () => ({
  listEmailDeliveryRecipients: listRecipients,
}));

vi.mock('@/lib/db/queries/user-preferences', () => ({
  getEmailNotificationPreferences: getPrefs,
  getUserPreferences: getUserPrefs,
}));

vi.mock('@/lib/db/queries/email-delivery-content', () => ({
  listEmailActivityDayKeysForUser: listDayKeys,
  findEmailDailyReminderPlanForUser: findPlan,
}));

vi.mock('@/lib/db/queries/email-notification-deliveries', () => ({
  claimEmailNotificationDelivery: claim,
  markEmailNotificationDeliverySent: markSent,
  markEmailNotificationDeliveryFailed: markFailed,
  markEmailNotificationDeliveryManualReview: markManualReview,
  EmailDeliveryLostLeaseError: class EmailDeliveryLostLeaseError extends Error {
    constructor(message?: string) {
      super(message);
      this.name = 'EmailDeliveryLostLeaseError';
    }
  },
}));

vi.mock('@/lib/observability/metrics', () => ({
  countMetric: vi.fn(),
}));

function createSender(overrides: Partial<EmailSender> = {}): EmailSender {
  return {
    resolveRequest: (message) =>
      ({
        from: 'Atlaris <notifications@mail.atlaris.app>',
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: message.headers,
        idempotencyKey: message.idempotencyKey,
      }) satisfies PersistedProviderRequest,
    sendResolved: vi.fn().mockResolvedValue({ providerMessageId: 're_1' }),
    ...overrides,
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
    listDayKeys.mockResolvedValue(['2026-07-06', '2026-07-07', '2026-07-08']);
    findPlan.mockResolvedValue({
      id: 'plan-1',
      topic: 'TypeScript',
      totalTasks: 4,
      completedTasks: 1,
    });
    claim.mockResolvedValue({
      outcome: 'claimed',
      deliveryId: 'd1',
      claimToken: 'claim-1',
      providerRequest: {
        from: 'Atlaris <notifications@mail.atlaris.app>',
        to: 'u@example.com',
        subject: 'Keep your learning streak alive',
        html: '<p>streak</p>',
        text: 'streak',
        idempotencyKey: 'u1:streak_reminder:2026-07-09',
      },
      reusedProviderRequest: false,
    });
    markSent.mockResolvedValue(undefined);
  });

  it('passes cursorUserId to recipients and preserves nextCursor', async () => {
    listRecipients.mockResolvedValue({
      recipients: [{ userId: 'u1', email: 'u@example.com' }],
      nextCursor: 'u1',
    });
    const sender = createSender();

    const result = await runEmailNotificationDelivery(
      {
        categories: ['streak_reminder'],
        schedulerDateUtc: '2026-07-09',
        cursorUserId: '00000000-0000-0000-0000-000000000000',
        batchSize: 50,
      },
      {
        db: {} as never,
        sender,
        unsubscribeSecret: 'secret',
        appUrl: 'https://atlaris.app',
        now: new Date('2026-07-09T15:00:00.000Z'),
      },
    );

    expect(listRecipients).toHaveBeenCalledWith({
      batchSize: 50,
      cursorUserId: '00000000-0000-0000-0000-000000000000',
      dbClient: expect.anything(),
    });
    expect(result.nextCursor).toBe('u1');
  });

  it('sends daily when streak claim is already terminal', async () => {
    claim
      .mockResolvedValueOnce({
        outcome: 'already_terminal',
        status: 'sent',
      })
      .mockResolvedValueOnce({
        outcome: 'claimed',
        deliveryId: 'd2',
        claimToken: 'claim-2',
        providerRequest: {
          from: 'Atlaris <notifications@mail.atlaris.app>',
          to: 'u@example.com',
          subject: "A quick nudge for today's learning",
          html: '<p>daily</p>',
          text: 'daily',
          idempotencyKey: 'u1:daily_reminder:2026-07-09',
        },
        reusedProviderRequest: false,
      });
    const sender = createSender();

    const result = await runEmailNotificationDelivery(
      {
        categories: ['daily_reminder', 'streak_reminder'],
        schedulerDateUtc: '2026-07-09',
      },
      {
        db: {} as never,
        sender,
        unsubscribeSecret: 'secret',
        appUrl: 'https://atlaris.app',
        now: new Date('2026-07-09T15:00:00.000Z'),
      },
    );

    expect(sender.sendResolved).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1);
    expect(result.alreadyTerminal).toBe(1);
    expect(claim).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'daily_reminder' }),
      expect.anything(),
    );
  });

  it('sends streak reminder and skips daily when streak wins', async () => {
    const sender = createSender();

    const result = await runEmailNotificationDelivery(
      {
        categories: ['daily_reminder', 'streak_reminder'],
        schedulerDateUtc: '2026-07-09',
      },
      {
        db: {} as never,
        sender,
        unsubscribeSecret: 'secret',
        appUrl: 'https://atlaris.app',
        now: new Date('2026-07-09T15:00:00.000Z'),
      },
    );

    expect(sender.sendResolved).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1);
    expect(result.claimed).toBe(1);
    expect(markSent).toHaveBeenCalledWith(
      {
        deliveryId: 'd1',
        claimToken: 'claim-1',
        providerMessageId: 're_1',
      },
      expect.anything(),
    );
  });

  it('sends daily only when request excludes streak even if prefs enable both', async () => {
    const sender = createSender();

    await runEmailNotificationDelivery(
      {
        categories: ['daily_reminder'],
        schedulerDateUtc: '2026-07-09',
      },
      {
        db: {} as never,
        sender,
        unsubscribeSecret: 'secret',
        appUrl: 'https://atlaris.app',
        now: new Date('2026-07-09T15:00:00.000Z'),
      },
    );

    expect(sender.sendResolved).toHaveBeenCalledTimes(1);
    expect(claim).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'daily_reminder' }),
      expect.anything(),
    );
  });

  it('does not query plans for weekly-only delivery', async () => {
    getPrefs.mockResolvedValue({
      unsubscribeAllOptionalEmails: false,
      categories: {
        weekly_summary: true,
        daily_reminder: false,
        streak_reminder: false,
      },
    });
    listDayKeys.mockResolvedValue(['2026-07-07']);
    const sender = createSender();

    await runEmailNotificationDelivery(
      {
        categories: ['weekly_summary'],
        schedulerDateUtc: '2026-07-13',
      },
      {
        db: {} as never,
        sender,
        unsubscribeSecret: 'secret',
        appUrl: 'https://atlaris.app',
        now: new Date('2026-07-13T15:00:00.000Z'),
      },
    );

    expect(findPlan).not.toHaveBeenCalled();
  });

  it('marks confirmed provider rejections as failed and reclaimable', async () => {
    const sender = createSender({
      sendResolved: vi
        .fn()
        .mockRejectedValue(
          new EmailProviderError(
            'rejected',
            'provider_configuration',
            'rejected',
          ),
        ),
    });

    const result = await runEmailNotificationDelivery(
      {
        categories: ['streak_reminder'],
        schedulerDateUtc: '2026-07-09',
      },
      {
        db: {} as never,
        sender,
        unsubscribeSecret: 'secret',
        now: new Date('2026-07-09T15:00:00.000Z'),
      },
    );

    expect(markFailed).toHaveBeenCalledWith(
      {
        deliveryId: 'd1',
        claimToken: 'claim-1',
        failureClass: 'provider_configuration',
      },
      expect.anything(),
    );
    expect(result.failed).toBe(1);
    expect(markSent).not.toHaveBeenCalled();
  });

  it('retains the lease for outcome-unknown transport failures', async () => {
    const sender = createSender({
      sendResolved: vi
        .fn()
        .mockRejectedValue(
          new EmailProviderError('network', 'provider_error', 'unknown'),
        ),
    });

    const result = await runEmailNotificationDelivery(
      {
        categories: ['streak_reminder'],
        schedulerDateUtc: '2026-07-09',
      },
      {
        db: {} as never,
        sender,
        unsubscribeSecret: 'secret',
        now: new Date('2026-07-09T15:00:00.000Z'),
      },
    );

    expect(markFailed).not.toHaveBeenCalled();
    expect(markSent).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
  });

  it('does not mark failed when provider succeeds but markSent rejects', async () => {
    markSent.mockRejectedValue(new Error('db down'));
    const sender = createSender();

    const result = await runEmailNotificationDelivery(
      {
        categories: ['streak_reminder'],
        schedulerDateUtc: '2026-07-09',
      },
      {
        db: {} as never,
        sender,
        unsubscribeSecret: 'secret',
        now: new Date('2026-07-09T15:00:00.000Z'),
      },
    );

    expect(markFailed).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
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
    const sender = createSender();

    const result = await runEmailNotificationDelivery(
      {
        categories: ['daily_reminder'],
        schedulerDateUtc: '2026-07-09',
      },
      {
        db: {} as never,
        sender,
        unsubscribeSecret: 'secret',
        now: new Date('2026-07-09T15:00:00.000Z'),
      },
    );

    expect(sender.sendResolved).not.toHaveBeenCalled();
    expect(result.examined).toBe(1);
    expect(result.sent).toBe(0);
  });
});
