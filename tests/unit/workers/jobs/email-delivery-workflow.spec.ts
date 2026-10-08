import type {
  EmailSender,
  PersistedProviderRequest,
} from '@/features/notifications/email/types';
import type { DbClient } from '@/lib/db/types';
import type { Logger } from '@/lib/logging/logger';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

import { resolveEmailRecipientGuard } from '../../../../workers/jobs/src/workflows/email-delivery/recipient-allowlist';
import {
  EMAIL_DELIVERY_PAGE_SIZE,
  type EmailDeliveryWorkflowDeps,
  type EmailDeliveryWorkflowParams,
  runEmailDeliveryWorkflow,
} from '../../../../workers/jobs/src/workflows/email-delivery/run';
import {
  EMAIL_DELIVERY_SCHEDULES,
  resolveScheduledEmailDeliveryRun,
} from '../../../../workers/jobs/src/workflows/email-delivery/schedule';
import { EmailProviderError } from '@/features/notifications/email/resend-adapter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runs = vi.hoisted(() => ({
  reserve: vi.fn(),
  claim: vi.fn(),
  load: vi.fn(),
  advance: vi.fn(),
  complete: vi.fn(),
  pause: vi.fn(),
  fail: vi.fn(),
  recordRetry: vi.fn(),
  needsReview: vi.fn(),
}));
const ledger = vi.hoisted(() => ({
  claim: vi.fn(),
  markSent: vi.fn(),
  markFailed: vi.fn(),
  markSkipped: vi.fn(),
  markManualReview: vi.fn(),
  summarize: vi.fn(),
}));
const recipients = vi.hoisted(() => ({ list: vi.fn(), isCurrent: vi.fn() }));

vi.mock('@/lib/db/queries/email-notification-delivery-runs', () => ({
  reserveEmailNotificationDeliveryRun: runs.reserve,
  claimEmailNotificationDeliveryRun: runs.claim,
  loadEmailNotificationDeliveryRun: runs.load,
  advanceEmailNotificationDeliveryRun: runs.advance,
  completeEmailNotificationDeliveryRun: runs.complete,
  pauseEmailNotificationDeliveryRun: runs.pause,
  failEmailNotificationDeliveryRun: runs.fail,
  recordEmailNotificationDeliveryRunRetry: runs.recordRetry,
  markEmailNotificationDeliveryRunNeedsReview: runs.needsReview,
}));

vi.mock('@/lib/db/queries/email-notification-deliveries', () => ({
  EMAIL_DELIVERY_LEASE_MS: 15 * 60 * 1000,
  EMAIL_DELIVERY_FAILURE_CLASS: {
    recipientIdentityChangedBeforeDelivery: 'recipient_identity_changed',
    recipientIdentityChangedAfterAmbiguousClaim:
      'recipient_changed_since_claim',
    preferencesDisabledBeforeDelivery: 'preference_disabled_before_delivery',
    preferencesDisabledAfterAmbiguousClaim:
      'preferences_disabled_after_ambiguous_claim',
  },
  EmailDeliveryLostLeaseError: class extends Error {},
  claimEmailNotificationDelivery: ledger.claim,
  markEmailNotificationDeliverySent: ledger.markSent,
  markEmailNotificationDeliveryFailed: ledger.markFailed,
  markEmailNotificationDeliverySkipped: ledger.markSkipped,
  markEmailNotificationDeliveryManualReview: ledger.markManualReview,
  summarizeEmailNotificationDeliveriesForRun: ledger.summarize,
}));

vi.mock('@/lib/db/queries/email-delivery-recipients', () => ({
  listEmailDeliveryRecipients: recipients.list,
  isEmailDeliveryRecipientCurrent: recipients.isCurrent,
}));

vi.mock('@/lib/db/queries/user-preferences', () => ({
  getEmailNotificationPreferences: vi.fn(async () => ({
    unsubscribeAllOptionalEmails: false,
    categories: {
      weekly_summary: false,
      daily_reminder: false,
      streak_reminder: true,
    },
  })),
  getUserPreferences: vi.fn(async () => ({ analyticsTimezone: 'UTC' })),
}));

vi.mock('@/lib/db/queries/email-delivery-content', () => ({
  // Activity on the three prior days and none today: streak-eligible.
  listEmailActivityDayKeysForUser: vi.fn(async () => [
    '2026-07-06',
    '2026-07-07',
    '2026-07-08',
  ]),
  findEmailDailyReminderPlanForUser: vi.fn(async () => null),
}));

vi.mock('@/lib/observability/metrics', () => ({ countMetric: vi.fn() }));

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const INSTANCE_ID = 'scheduled-instance-1';
const WORKFLOW_RUN_ID = `cf:${INSTANCE_ID}`;
const SCHEDULED_TIME = Date.parse('2026-07-09T14:00:03.000Z');
const LISTED = 'listed@example.com';
const UNLISTED = 'unlisted@example.com';

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    runKind: 'daily',
    schedulerDateUtc: '2026-07-09',
    referenceTimestampUtc: new Date('2026-07-09T14:00:00.000Z'),
    status: 'running',
    workflowRunId: WORKFLOW_RUN_ID,
    cursorUserId: null,
    scanCompletedAt: null,
    failed: 0,
    manualReview: 0,
    recipientErrors: 0,
    ...overrides,
  };
}

function providerRequest(to: string): PersistedProviderRequest {
  return {
    from: 'Atlaris <notifications@mail.atlaris.app>',
    to,
    subject: 'Keep your learning streak alive',
    html: '<p>streak</p>',
    text: 'streak',
    idempotencyKey: `${to}:streak_reminder:2026-07-09`,
  };
}

function createSender(
  sendResolved: EmailSender['sendResolved'] = vi.fn(async () => ({
    providerMessageId: 're_1',
  })),
): EmailSender & { sendResolved: ReturnType<typeof vi.fn> } {
  return {
    resolveRequest: (message) => providerRequest(message.to),
    sendResolved: vi.fn(sendResolved),
  };
}

/** Runs each step like Workflows does: retries until the limit or a NonRetryableError. */
function createStep() {
  const calls: Array<{ name: string; attempts: number; delays: number[] }> = [];
  const step = {
    async do(
      name: string,
      config: {
        retries: {
          limit: number;
          delay: (input: { ctx: unknown; error: Error }) => unknown;
        };
      },
      callback: (ctx: { attempt: number }) => Promise<unknown>,
    ) {
      const call = { name, attempts: 0, delays: [] as number[] };
      calls.push(call);
      for (let attempt = 1; ; attempt += 1) {
        call.attempts = attempt;
        const ctx = { attempt, step: { name, count: 1 }, config };
        try {
          return await callback(ctx);
        } catch (error) {
          if (
            (error as Error).name === 'NonRetryableError' ||
            attempt > config.retries.limit
          ) {
            throw error;
          }
          call.delays.push(
            (await config.retries.delay({
              ctx,
              error: error as Error,
            })) as number,
          );
        }
      }
    },
  };
  return { step: step as unknown as Pick<WorkflowStep, 'do'>, calls };
}

function scheduledEvent(
  cron: string = EMAIL_DELIVERY_SCHEDULES.daily,
  scheduledTime = SCHEDULED_TIME,
): WorkflowEvent<EmailDeliveryWorkflowParams> {
  return {
    payload: {} as EmailDeliveryWorkflowParams,
    timestamp: new Date(scheduledTime),
    instanceId: INSTANCE_ID,
    workflowName: 'atlaris-email-delivery-staging',
    schedule: { cron, scheduledTime },
  };
}

function makeDeps(overrides: Partial<EmailDeliveryWorkflowDeps> = {}) {
  const sender = createSender();
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const captureException = vi.fn();
  const deps: EmailDeliveryWorkflowDeps = {
    isEnabled: () => true,
    recipientGuard: resolveEmailRecipientGuard({ WORKER_ENV: 'production' }),
    withDb: (fn) => fn({} as DbClient),
    createSender: () => sender,
    logger: logger as unknown as Logger,
    captureException,
    nonRetryable: (message) =>
      Object.assign(new Error(message), { name: 'NonRetryableError' }),
    now: () => new Date('2026-07-09T14:01:00.000Z'),
    ...overrides,
  };
  return { deps, sender, logger, captureException };
}

describe('runEmailDeliveryWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('EMAIL_UNSUBSCRIBE_TOKEN_SECRET', 'A'.repeat(43));

    runs.reserve.mockResolvedValue({
      outcome: 'reserved',
      run: runRow({ status: 'queued', workflowRunId: null }),
    });
    runs.claim.mockResolvedValue({ outcome: 'claimed', run: runRow() });
    runs.load.mockResolvedValue(runRow());
    runs.advance.mockResolvedValue({ outcome: 'advanced' });
    runs.complete.mockResolvedValue({ outcome: 'transitioned' });
    runs.pause.mockResolvedValue({ outcome: 'transitioned' });
    runs.fail.mockResolvedValue({ outcome: 'transitioned' });
    runs.recordRetry.mockResolvedValue({ outcome: 'recorded' });
    runs.needsReview.mockResolvedValue({ outcome: 'transitioned' });

    recipients.list.mockResolvedValue({
      recipients: [{ userId: 'u1', email: LISTED }],
      nextCursor: null,
    });
    recipients.isCurrent.mockResolvedValue(true);
    ledger.claim.mockImplementation(async (args) => ({
      outcome: 'claimed',
      deliveryId: `d-${args.userId}`,
      claimToken: 'claim-1',
      providerRequest: args.providerRequest,
      reusedProviderRequest: false,
      reclaimedExpiredPending: false,
    }));
    ledger.summarize.mockResolvedValue({
      sent: 1,
      skipped: 0,
      failed: 0,
      manualReview: 0,
    });
  });

  it('claims the scheduled logical run, sends one page of at most 20, and completes', async () => {
    const { deps, sender } = makeDeps();
    const { step, calls } = createStep();

    await expect(
      runEmailDeliveryWorkflow(scheduledEvent(), step, deps),
    ).resolves.toEqual({ kind: 'completed' });

    expect(runs.reserve).toHaveBeenCalledWith(
      {
        runKind: 'daily',
        schedulerDateUtc: '2026-07-09',
        referenceTimestampUtc: new Date('2026-07-09T14:00:00.000Z'),
      },
      expect.anything(),
    );
    expect(runs.claim).toHaveBeenCalledWith(
      { runId: RUN_ID, workflowRunId: WORKFLOW_RUN_ID },
      expect.anything(),
    );
    expect(EMAIL_DELIVERY_PAGE_SIZE).toBe(20);
    expect(recipients.list).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 20, cursorUserId: null }),
    );
    expect(sender.sendResolved).toHaveBeenCalledTimes(1);
    expect(ledger.markSent).toHaveBeenCalledTimes(1);
    expect(runs.complete).toHaveBeenCalledTimes(1);
    expect(calls.map((call) => call.name)).toEqual([
      'claim-run',
      'page-1',
      'finalize',
    ]);
  });

  it('pages until the cursor is exhausted, one step per page', async () => {
    recipients.list
      .mockResolvedValueOnce({
        recipients: [{ userId: 'u1', email: LISTED }],
        nextCursor: 'u1',
      })
      .mockResolvedValueOnce({ recipients: [], nextCursor: null });
    const { deps } = makeDeps();
    const { step, calls } = createStep();

    await runEmailDeliveryWorkflow(scheduledEvent(), step, deps);

    expect(calls.map((call) => call.name)).toEqual([
      'claim-run',
      'page-1',
      'page-2',
      'finalize',
    ]);
  });

  it('exits a duplicate firing without claiming or sending', async () => {
    runs.reserve.mockResolvedValue({ outcome: 'existing', run: runRow() });
    const { deps, sender } = makeDeps();
    const { step, calls } = createStep();

    await expect(
      runEmailDeliveryWorkflow(scheduledEvent(), step, deps),
    ).resolves.toEqual({ kind: 'duplicate', runId: RUN_ID });

    expect(runs.claim).not.toHaveBeenCalled();
    expect(sender.sendResolved).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it('claims an existing unclaimed queued run left by a crashed firing', async () => {
    runs.reserve.mockResolvedValue({
      outcome: 'existing',
      run: runRow({ status: 'queued', workflowRunId: null }),
    });
    const { deps } = makeDeps();

    await expect(
      runEmailDeliveryWorkflow(scheduledEvent(), createStep().step, deps),
    ).resolves.toEqual({ kind: 'completed' });
    expect(runs.claim).toHaveBeenCalledTimes(1);
  });

  it('exits without reserving when the switch is off or the cron is unknown', async () => {
    const disabled = makeDeps({ isEnabled: () => false });
    await expect(
      runEmailDeliveryWorkflow(
        scheduledEvent(),
        createStep().step,
        disabled.deps,
      ),
    ).resolves.toEqual({ kind: 'disabled' });

    // `* * 1` means Sunday on Cloudflare; only `MON` maps to the weekly run.
    const unknown = makeDeps();
    await expect(
      runEmailDeliveryWorkflow(
        scheduledEvent('30 14 * * 1'),
        createStep().step,
        unknown.deps,
      ),
    ).resolves.toEqual({ kind: 'unknown_schedule' });

    expect(runs.reserve).not.toHaveBeenCalled();
  });

  it('claims a manual command run by its ID without reserving', async () => {
    const { deps } = makeDeps();
    const event: WorkflowEvent<EmailDeliveryWorkflowParams> = {
      payload: { v: 1, runId: RUN_ID },
      timestamp: new Date(),
      instanceId: INSTANCE_ID,
      workflowName: 'atlaris-email-delivery-staging',
    };

    await expect(
      runEmailDeliveryWorkflow(event, createStep().step, deps),
    ).resolves.toEqual({ kind: 'completed' });
    expect(runs.reserve).not.toHaveBeenCalled();
    expect(runs.claim).toHaveBeenCalledWith(
      { runId: RUN_ID, workflowRunId: WORKFLOW_RUN_ID },
      expect.anything(),
    );
  });

  it('does not resend a message whose ledger row is already terminal', async () => {
    ledger.claim.mockResolvedValue({
      outcome: 'already_terminal',
      status: 'sent',
    });
    const { deps, sender } = makeDeps();

    await expect(
      runEmailDeliveryWorkflow(scheduledEvent(), createStep().step, deps),
    ).resolves.toEqual({ kind: 'completed' });
    expect(sender.sendResolved).not.toHaveBeenCalled();
  });

  it('marks an ambiguous provider outcome for manual review and ends the run in needs_review', async () => {
    const { deps, sender, captureException } = makeDeps();
    sender.sendResolved.mockRejectedValue(
      new EmailProviderError(
        'conflict',
        'provider_idempotency_conflict',
        'unknown',
      ),
    );
    ledger.summarize.mockResolvedValue({
      sent: 0,
      skipped: 0,
      failed: 0,
      manualReview: 1,
    });
    const { step, calls } = createStep();

    await expect(
      runEmailDeliveryWorkflow(scheduledEvent(), step, deps),
    ).rejects.toMatchObject({
      name: 'NonRetryableError',
      message: 'Email delivery requires manual review',
    });

    expect(ledger.markManualReview).toHaveBeenCalledWith(
      expect.objectContaining({
        failureClass: 'provider_idempotency_conflict',
      }),
      expect.anything(),
    );
    expect(runs.needsReview).toHaveBeenCalledTimes(1);
    expect(sender.sendResolved).toHaveBeenCalledTimes(1);
    expect(calls.find((call) => call.name === 'finalize')?.attempts).toBe(1);
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: {
        job: 'email-delivery',
        runtime: 'cloudflare-worker',
        runKind: 'daily',
        errorClass: 'recipient_or_delivery_review_required',
      },
    });
  });

  it('keeps the lease after an unknown send outcome and waits for it instead of resending', async () => {
    const { deps, sender } = makeDeps();
    sender.sendResolved.mockRejectedValueOnce(new Error('socket reset'));
    // The next attempt finds the message still leased.
    ledger.claim
      .mockImplementationOnce(async (args) => ({
        outcome: 'claimed',
        deliveryId: 'd-u1',
        claimToken: 'claim-1',
        providerRequest: args.providerRequest,
        reusedProviderRequest: false,
        reclaimedExpiredPending: false,
      }))
      .mockResolvedValue({ outcome: 'in_flight' });
    const { step, calls } = createStep();

    await expect(
      runEmailDeliveryWorkflow(scheduledEvent(), step, deps),
    ).rejects.toMatchObject({ name: 'NonRetryableError' });

    const page = calls.find((call) => call.name === 'page-1');
    expect(page?.attempts).toBe(4);
    expect(page?.delays).toEqual([
      15 * 60 * 1000,
      15 * 60 * 1000,
      15 * 60 * 1000,
    ]);
    expect(sender.sendResolved).toHaveBeenCalledTimes(1);
    expect(ledger.markFailed).not.toHaveBeenCalled();
    expect(runs.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId: WORKFLOW_RUN_ID,
        errorClass: 'retry_exhausted',
      }),
      expect.anything(),
    );
  });

  it('pauses the run before any send when the switch is turned off mid-run', async () => {
    const createSenderSpy = vi.fn();
    const { deps } = makeDeps({ createSender: createSenderSpy });
    const event: WorkflowEvent<EmailDeliveryWorkflowParams> = {
      payload: { v: 1, runId: RUN_ID },
      timestamp: new Date(),
      instanceId: INSTANCE_ID,
      workflowName: 'atlaris-email-delivery-staging',
    };

    await expect(
      runEmailDeliveryWorkflow(event, createStep().step, {
        ...deps,
        isEnabled: () => false,
      }),
    ).resolves.toEqual({ kind: 'paused' });

    expect(runs.pause).toHaveBeenCalledWith(
      {
        runId: RUN_ID,
        workflowRunId: WORKFLOW_RUN_ID,
        reason: 'delivery_switch_disabled',
      },
      expect.anything(),
    );
    expect(createSenderSpy).not.toHaveBeenCalled();
    expect(recipients.list).not.toHaveBeenCalled();
  });

  describe('staging recipient allowlist', () => {
    beforeEach(() => {
      recipients.list.mockResolvedValue({
        recipients: [
          { userId: 'u1', email: LISTED },
          { userId: 'u2', email: UNLISTED },
        ],
        nextCursor: null,
      });
    });

    it('sends only to listed addresses and never claims the others', async () => {
      const { deps, sender } = makeDeps({
        recipientGuard: resolveEmailRecipientGuard({
          WORKER_ENV: 'staging',
          EMAIL_TEST_RECIPIENT_ALLOWLIST: ` ${LISTED.toUpperCase()} , other@example.com`,
        }),
      });

      await runEmailDeliveryWorkflow(scheduledEvent(), createStep().step, deps);

      expect(sender.sendResolved).toHaveBeenCalledTimes(1);
      expect(sender.sendResolved.mock.calls[0]?.[0]).toMatchObject({
        to: LISTED,
      });
      expect(ledger.claim).toHaveBeenCalledTimes(1);
      expect(ledger.claim).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1' }),
        expect.anything(),
      );
      expect(runs.advance).toHaveBeenCalledWith(
        expect.objectContaining({
          counts: expect.objectContaining({ examined: 2, sent: 1, skipped: 1 }),
        }),
        expect.anything(),
      );
    });

    it('sends nothing and pauses with a logged reason when the variable is missing', async () => {
      const { deps, sender, logger } = makeDeps({
        recipientGuard: resolveEmailRecipientGuard({ WORKER_ENV: 'staging' }),
      });

      await expect(
        runEmailDeliveryWorkflow(scheduledEvent(), createStep().step, deps),
      ).resolves.toEqual({ kind: 'paused' });

      expect(sender.sendResolved).not.toHaveBeenCalled();
      expect(ledger.claim).not.toHaveBeenCalled();
      expect(runs.pause).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'test_recipient_allowlist_missing' }),
        expect.anything(),
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'test_recipient_allowlist_missing' }),
        expect.any(String),
      );
    });

    it('is ignored in production', async () => {
      const { deps, sender } = makeDeps({
        recipientGuard: resolveEmailRecipientGuard({
          WORKER_ENV: 'production',
          EMAIL_TEST_RECIPIENT_ALLOWLIST: LISTED,
        }),
      });

      await runEmailDeliveryWorkflow(scheduledEvent(), createStep().step, deps);

      expect(sender.sendResolved).toHaveBeenCalledTimes(2);
    });
  });
});

describe('resolveScheduledEmailDeliveryRun', () => {
  it('maps both schedules to their run kind and UTC date', () => {
    expect(
      resolveScheduledEmailDeliveryRun({
        cron: '30 14 * * MON',
        scheduledTime: Date.parse('2026-07-13T14:30:00.000Z'),
      }),
    ).toEqual({ runKind: 'weekly', schedulerDateUtc: '2026-07-13' });
    expect(
      resolveScheduledEmailDeliveryRun({
        cron: '30 14 * * MON',
        scheduledTime: Date.parse('2026-07-12T14:30:00.000Z'),
      }),
    ).toBeNull();
  });
});
