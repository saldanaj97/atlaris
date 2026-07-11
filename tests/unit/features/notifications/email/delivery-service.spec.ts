import type {
  EmailSender,
  PersistedProviderRequest,
} from '@/features/notifications/email/types';

import { runEmailNotificationDelivery } from '@/features/notifications/email/delivery-service';
import { EmailProviderError } from '@/features/notifications/email/resend-adapter';
import { verifyUnsubscribeToken } from '@/features/notifications/email/unsubscribe-token';
import { countMetric } from '@/lib/observability/metrics';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listRecipients = vi.hoisted(() => vi.fn());
const getPrefs = vi.hoisted(() => vi.fn());
const getUserPrefs = vi.hoisted(() => vi.fn());
const listDayKeys = vi.hoisted(() => vi.fn());
const findPlan = vi.hoisted(() => vi.fn());
const claim = vi.hoisted(() => vi.fn());
const markSent = vi.hoisted(() => vi.fn());
const markFailed = vi.hoisted(() => vi.fn());
const markSkipped = vi.hoisted(() => vi.fn());
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
  EMAIL_DELIVERY_LEASE_MS: 15 * 60 * 1000,
  claimEmailNotificationDelivery: claim,
  markEmailNotificationDeliverySent: markSent,
  markEmailNotificationDeliveryFailed: markFailed,
  markEmailNotificationDeliverySkipped: markSkipped,
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

  it('uses a retry wall clock for ledger leases without changing the content reference clock', async () => {
    const referenceNow = new Date('2026-07-10T14:00:00.000Z');
    const deliveryNow = new Date('2026-07-10T14:16:00.000Z');

    await runEmailNotificationDelivery(
      {
        categories: ['daily_reminder'],
        schedulerDateUtc: '2026-07-10',
      },
      {
        db: {} as never,
        sender: createSender(),
        unsubscribeSecret: 'secret',
        appUrl: 'https://atlaris.app',
        now: referenceNow,
        deliveryNow,
      },
    );

    expect(claim).toHaveBeenCalledWith(
      expect.objectContaining({ now: deliveryNow }),
      expect.anything(),
    );
  });

  it('issues unsubscribe tokens from the delivery wall clock for old logical runs', async () => {
    const deliveryNow = new Date('2026-07-10T14:16:00.000Z');
    const sender = createSender();
    const resolveRequest = vi.fn(sender.resolveRequest);
    sender.resolveRequest = resolveRequest;

    await runEmailNotificationDelivery(
      {
        categories: ['daily_reminder'],
        schedulerDateUtc: '2026-01-01',
      },
      {
        db: {} as never,
        sender,
        unsubscribeSecret: 'secret',
        appUrl: 'https://atlaris.app',
        now: new Date('2026-01-01T14:00:00.000Z'),
        deliveryNow,
      },
    );

    const text = resolveRequest.mock.calls[0]?.[0].text ?? '';
    const unsubscribeUrl = text.match(/Unsubscribe: (https:\/\/\S+)/)?.[1];
    const token = new URL(unsubscribeUrl ?? '').searchParams.get('token') ?? '';

    expect(
      verifyUnsubscribeToken({
        token,
        secret: 'secret',
        nowMs: deliveryNow.getTime(),
      }),
    ).toMatchObject({ iat: Math.floor(deliveryNow.getTime() / 1000) });
  });

  it('keeps content identity stable while refreshing unsubscribe tokens across retry clocks', async () => {
    const referenceNow = new Date('2026-07-10T14:00:00.000Z');
    const sender = createSender();
    const resolveRequest = vi.fn(sender.resolveRequest);
    sender.resolveRequest = resolveRequest;

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-10T14:00:00.000Z'));
      await runEmailNotificationDelivery(
        {
          categories: ['daily_reminder'],
          schedulerDateUtc: '2026-07-10',
        },
        {
          db: {} as never,
          sender,
          unsubscribeSecret: 'secret',
          appUrl: 'https://atlaris.app',
          now: referenceNow,
          deliveryNow: new Date('2026-07-10T14:00:00.000Z'),
        },
      );

      vi.setSystemTime(new Date('2026-07-10T14:16:00.000Z'));
      await runEmailNotificationDelivery(
        {
          categories: ['daily_reminder'],
          schedulerDateUtc: '2026-07-10',
        },
        {
          db: {} as never,
          sender,
          unsubscribeSecret: 'secret',
          appUrl: 'https://atlaris.app',
          now: referenceNow,
          deliveryNow: new Date('2026-07-10T14:16:00.000Z'),
        },
      );
    } finally {
      vi.useRealTimers();
    }

    expect(resolveRequest).toHaveBeenCalledTimes(2);
    const firstRequest = resolveRequest.mock.calls[0]![0];
    const secondRequest = resolveRequest.mock.calls[1]![0];
    expect(firstRequest).toMatchObject({
      to: secondRequest.to,
      subject: secondRequest.subject,
      idempotencyKey: secondRequest.idempotencyKey,
    });
    expect(firstRequest.text).not.toBe(secondRequest.text);
  });

  it('continues after a recipient-specific prefetch error', async () => {
    const error = new Error('preferences unavailable');
    const logger = { error: vi.fn(), info: vi.fn() };
    listRecipients.mockResolvedValue({
      recipients: [
        { userId: 'u1', email: 'u1@example.com' },
        { userId: 'u2', email: 'u2@example.com' },
      ],
      nextCursor: 'u2',
    });
    getPrefs.mockRejectedValueOnce(error);
    const sender = createSender();

    const result = await runEmailNotificationDelivery(
      {
        categories: ['daily_reminder'],
        schedulerDateUtc: '2026-07-09',
      },
      {
        db: {} as never,
        sender,
        logger: logger as never,
        unsubscribeSecret: 'secret',
        appUrl: 'https://atlaris.app',
        now: new Date('2026-07-09T15:00:00.000Z'),
      },
    );

    expect(result).toMatchObject({
      examined: 2,
      sent: 1,
      failed: 1,
      recipientErrors: 1,
      needsReview: true,
      pageFailure: null,
      nextCursor: 'u2',
    });
    expect(sender.sendResolved).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'email_notifications',
        event: 'recipient_processing_error',
        failureClass: 'recipient_processing_error',
      }),
      'Email notification recipient processing failed; skipping user',
    );
    expect(logger.error.mock.calls[0]?.[0]).not.toHaveProperty('userId');
    expect(logger.error.mock.calls[0]?.[0]).not.toHaveProperty('err');
    expect(countMetric).toHaveBeenCalledWith(
      'atlaris.email.notification.failed',
      1,
      {
        attributes: { reason: 'recipient_processing_error' },
      },
    );
  });

  it('retries a page-wide transient recipient data access failure', async () => {
    const error = Object.assign(new Error('connection failure'), {
      code: '08006',
    });
    const logger = { error: vi.fn(), info: vi.fn() };
    getPrefs.mockRejectedValueOnce(error);
    const sender = createSender();

    await expect(
      runEmailNotificationDelivery(
        {
          categories: ['daily_reminder'],
          schedulerDateUtc: '2026-07-09',
        },
        {
          db: {} as never,
          sender,
          logger: logger as never,
          unsubscribeSecret: 'secret',
          appUrl: 'https://atlaris.app',
          now: new Date('2026-07-09T15:00:00.000Z'),
        },
      ),
    ).rejects.toBe(error);

    expect(sender.sendResolved).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not checkpoint a page after a delivery-ledger persistence failure', async () => {
    claim.mockRejectedValueOnce(new Error('ledger unavailable'));

    await expect(
      runEmailNotificationDelivery(
        {
          categories: ['daily_reminder'],
          schedulerDateUtc: '2026-07-09',
        },
        {
          db: {} as never,
          sender: createSender(),
          unsubscribeSecret: 'secret',
          appUrl: 'https://atlaris.app',
          now: new Date('2026-07-09T15:00:00.000Z'),
        },
      ),
    ).rejects.toThrow('Email delivery persistence failed');
  });

  it('skips daily when streak was already sent in a prior pass', async () => {
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

    expect(sender.sendResolved).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
    expect(result.alreadyTerminal).toBe(1);
    expect(result.claimed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(markSkipped).toHaveBeenCalledWith(
      {
        deliveryId: 'd2',
        claimToken: 'claim-2',
        failureClass: 'suppressed_by_streak_reminder',
      },
      expect.anything(),
    );
  });

  it('sends daily when streak is already terminal for a non-sent status', async () => {
    claim
      .mockResolvedValueOnce({
        outcome: 'already_terminal',
        status: 'manual_review',
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
    expect(result.skipped).toBe(0);
    expect(claim).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'daily_reminder' }),
      expect.anything(),
    );
  });

  it('sends streak reminder and skips daily when streak wins', async () => {
    claim
      .mockResolvedValueOnce({
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
    expect(result.claimed).toBe(2);
    expect(result.skipped).toBe(1);
    expect(markSent).toHaveBeenCalledWith(
      {
        deliveryId: 'd1',
        claimToken: 'claim-1',
        providerMessageId: 're_1',
      },
      expect.anything(),
    );
    expect(markSkipped).toHaveBeenCalledWith(
      {
        deliveryId: 'd2',
        claimToken: 'claim-2',
        failureClass: 'suppressed_by_streak_reminder',
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
    expect(result.pageFailure).toEqual({
      kind: 'terminal',
      failureClass: 'provider_configuration',
    });
    expect(markSent).not.toHaveBeenCalled();
  });

  it('continues after a recipient-specific provider rejection', async () => {
    listRecipients.mockResolvedValue({
      recipients: [
        { userId: 'u1', email: 'invalid@example.com' },
        { userId: 'u2', email: 'valid@example.com' },
      ],
      nextCursor: 'u2',
    });
    const sendResolved = vi
      .fn()
      .mockRejectedValueOnce(
        new EmailProviderError(
          'invalid recipient',
          'provider_recipient_invalid',
          'rejected',
        ),
      )
      .mockResolvedValueOnce({ providerMessageId: 're_2' });
    const sender = createSender({ sendResolved });

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

    expect(sendResolved).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      examined: 2,
      failed: 1,
      sent: 1,
      nextCursor: 'u2',
      pageFailure: null,
    });
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

  it('returns a retryable page failure for provider rate limiting without advancing a page', async () => {
    const sender = createSender({
      sendResolved: vi
        .fn()
        .mockRejectedValue(
          new EmailProviderError(
            'rate limited',
            'provider_rate_limited',
            'retryable',
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
        failureClass: 'provider_rate_limited',
      },
      expect.anything(),
    );
    expect(result).toMatchObject({
      pageFailure: {
        kind: 'retryable',
        failureClass: 'provider_rate_limited',
        retryAfterMs: 60_000,
      },
    });
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
