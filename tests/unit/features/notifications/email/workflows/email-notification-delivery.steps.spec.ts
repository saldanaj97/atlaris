import type { EmailNotificationDeliveryWorkflowInput } from '@/features/notifications/email/workflows/email-notification-delivery.types';

import {
  finalizeEmailNotificationDeliveryRunStep,
  processEmailNotificationDeliveryPageStep,
} from '@/features/notifications/email/workflows/email-notification-delivery.steps';
import { EnvValidationError } from '@/lib/config/env/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveFlag: vi.fn(),
  runDelivery: vi.fn(),
  createSender: vi.fn(),
  summarizeLedger: vi.fn(),
  loadRun: vi.fn(),
  pause: vi.fn(),
  recordRetry: vi.fn(),
  advance: vi.fn(),
  complete: vi.fn(),
  markNeedsReview: vi.fn(),
  fail: vi.fn(),
  getStepMetadata: vi.fn(),
  getWorkflowMetadata: vi.fn(),
}));

vi.mock('@/features/notifications/email/delivery-flag', () => ({
  resolveEmailNotificationDeliveryEnabled: mocks.resolveFlag,
}));
vi.mock('@/features/notifications/email/delivery-service', () => ({
  runEmailNotificationDelivery: mocks.runDelivery,
}));
vi.mock('@/features/notifications/email/factory', () => ({
  createConfiguredEmailSender: mocks.createSender,
}));
vi.mock('@/features/notifications/email/delivery-monitor', () => ({
  finishEmailNotificationDeliveryMonitor: vi.fn(),
  startEmailNotificationDeliveryMonitor: vi.fn(),
}));
vi.mock('@/lib/db/queries/email-notification-deliveries', () => ({
  summarizeEmailNotificationDeliveriesForRun: mocks.summarizeLedger,
}));
vi.mock('@/lib/db/queries/email-notification-delivery-runs', () => ({
  attachEmailNotificationDeliveryRunMonitorCheckIn: vi.fn(),
  claimEmailNotificationDeliveryRun: vi.fn(),
  completeEmailNotificationDeliveryRun: mocks.complete,
  failEmailNotificationDeliveryRun: mocks.fail,
  loadEmailNotificationDeliveryRun: mocks.loadRun,
  markEmailNotificationDeliveryRunNeedsReview: mocks.markNeedsReview,
  pauseEmailNotificationDeliveryRun: mocks.pause,
  recordEmailNotificationDeliveryRunRetry: mocks.recordRetry,
  advanceEmailNotificationDeliveryRun: mocks.advance,
}));
vi.mock('@supabase/service-role', () => ({ db: {} }));
vi.mock('@/lib/observability/metrics', () => ({ countMetric: vi.fn() }));
vi.mock('workflow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('workflow')>();
  return {
    ...actual,
    getStepMetadata: mocks.getStepMetadata,
    getWorkflowMetadata: mocks.getWorkflowMetadata,
  };
});

const input: EmailNotificationDeliveryWorkflowInput = { runId: 'run-1' };

const runningRun = {
  id: 'run-1',
  runKind: 'daily',
  schedulerDateUtc: '2026-07-10',
  referenceTimestampUtc: new Date('2026-07-10T14:00:00.000Z'),
  status: 'running',
  workflowRunId: 'workflow-1',
  cursorUserId: null,
  monitorCheckInId: null,
  recipientErrors: 0,
  failed: 0,
  manualReview: 0,
};

describe('email notification delivery workflow steps', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.getWorkflowMetadata.mockReturnValue({ workflowRunId: 'workflow-1' });
    mocks.getStepMetadata.mockReturnValue({ attempt: 1 });
    mocks.loadRun.mockResolvedValue(runningRun);
    mocks.resolveFlag.mockResolvedValue(true);
    mocks.createSender.mockReturnValue({});
    mocks.summarizeLedger.mockResolvedValue({
      sent: 0,
      skipped: 0,
      failed: 0,
      manualReview: 0,
    });
  });

  it('keeps the persisted cursor unchanged for a retryable page failure', async () => {
    mocks.runDelivery.mockResolvedValue({
      examined: 1,
      claimed: 1,
      sent: 0,
      skipped: 0,
      failed: 1,
      alreadyTerminal: 0,
      inFlight: 0,
      manualReview: 0,
      recipientErrors: 0,
      nextCursor: 'user-1',
      needsReview: false,
      pageFailure: {
        kind: 'retryable',
        failureClass: 'provider_rate_limited',
        retryAfterMs: 60_000,
      },
    });
    mocks.recordRetry.mockResolvedValue({ outcome: 'recorded' });

    await expect(
      processEmailNotificationDeliveryPageStep(input),
    ).rejects.toThrow('Email delivery page retry scheduled');

    expect(mocks.recordRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        workflowRunId: 'workflow-1',
        errorClass: 'provider_rate_limited',
      }),
      expect.anything(),
    );
    expect(mocks.advance).not.toHaveBeenCalled();
  });

  it('retries a page-wide database failure without advancing its cursor', async () => {
    mocks.runDelivery.mockRejectedValue(
      Object.assign(new Error('connection failure'), { code: '08006' }),
    );
    mocks.recordRetry.mockResolvedValue({ outcome: 'recorded' });

    await expect(
      processEmailNotificationDeliveryPageStep(input),
    ).rejects.toThrow('Email delivery page retry scheduled');

    expect(mocks.recordRetry).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: 'page_processing_error' }),
      expect.anything(),
    );
    expect(mocks.advance).not.toHaveBeenCalled();
  });

  it('fails a missing email configuration without retrying the page', async () => {
    mocks.runDelivery.mockRejectedValue(
      new EnvValidationError(
        'Missing required environment variable: EMAIL_UNSUBSCRIBE_TOKEN_SECRET',
        'EMAIL_UNSUBSCRIBE_TOKEN_SECRET',
      ),
    );
    mocks.fail.mockResolvedValue({ outcome: 'transitioned' });

    await expect(
      processEmailNotificationDeliveryPageStep(input),
    ).rejects.toThrow('Email delivery configuration is invalid');

    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: 'email_configuration' }),
      expect.anything(),
    );
    expect(mocks.recordRetry).not.toHaveBeenCalled();
    expect(mocks.advance).not.toHaveBeenCalled();
  });

  it('pauses before creating a sender when the delivery flag is disabled', async () => {
    mocks.resolveFlag.mockResolvedValue(false);
    mocks.pause.mockResolvedValue({ outcome: 'transitioned' });

    await expect(
      processEmailNotificationDeliveryPageStep(input),
    ).resolves.toEqual({ kind: 'paused' });

    expect(mocks.createSender).not.toHaveBeenCalled();
    expect(mocks.runDelivery).not.toHaveBeenCalled();
    expect(mocks.advance).not.toHaveBeenCalled();
  });

  it('proceeds directly to finalization after a replayed final-page checkpoint', async () => {
    mocks.loadRun.mockResolvedValue({
      ...runningRun,
      scanCompletedAt: new Date('2026-07-10T14:05:00.000Z'),
    });

    await expect(
      processEmailNotificationDeliveryPageStep(input),
    ).resolves.toEqual({ kind: 'page_processed', nextCursor: null });

    expect(mocks.resolveFlag).not.toHaveBeenCalled();
    expect(mocks.createSender).not.toHaveBeenCalled();
    expect(mocks.runDelivery).not.toHaveBeenCalled();
  });

  it('terminalizes a retryable page after the bounded fourth attempt', async () => {
    mocks.getStepMetadata.mockReturnValue({ attempt: 4 });
    mocks.runDelivery.mockResolvedValue({
      examined: 1,
      claimed: 1,
      sent: 0,
      skipped: 0,
      failed: 1,
      alreadyTerminal: 0,
      inFlight: 0,
      manualReview: 0,
      recipientErrors: 0,
      nextCursor: 'user-1',
      needsReview: false,
      pageFailure: {
        kind: 'retryable',
        failureClass: 'provider_rate_limited',
        retryAfterMs: 60_000,
      },
    });
    mocks.fail.mockResolvedValue({ outcome: 'transitioned' });

    await expect(
      processEmailNotificationDeliveryPageStep(input),
    ).rejects.toThrow('Email delivery page retry limit exhausted');

    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: 'retry_exhausted' }),
      expect.anything(),
    );
    expect(mocks.recordRetry).not.toHaveBeenCalled();
  });

  it('turns reconciled manual-review work into a terminal needs-review run', async () => {
    mocks.summarizeLedger.mockResolvedValue({
      sent: 1,
      skipped: 0,
      failed: 0,
      manualReview: 1,
    });
    mocks.markNeedsReview.mockResolvedValue({ outcome: 'transitioned' });

    await expect(
      finalizeEmailNotificationDeliveryRunStep(input),
    ).rejects.toThrow('Email delivery requires manual review');

    expect(mocks.markNeedsReview).toHaveBeenCalledWith(
      expect.objectContaining({
        ledgerSummary: { sent: 1, skipped: 0, failed: 0, manualReview: 1 },
      }),
      expect.anything(),
    );
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('turns failed ledger work into a terminal needs-review run', async () => {
    mocks.summarizeLedger.mockResolvedValue({
      sent: 0,
      skipped: 0,
      failed: 1,
      manualReview: 0,
    });
    mocks.markNeedsReview.mockResolvedValue({ outcome: 'transitioned' });
    mocks.complete.mockResolvedValue({ outcome: 'transitioned' });

    await expect(
      finalizeEmailNotificationDeliveryRunStep(input),
    ).rejects.toThrow('Email delivery requires manual review');

    expect(mocks.markNeedsReview).toHaveBeenCalledWith(
      expect.objectContaining({
        ledgerSummary: {
          sent: 0,
          skipped: 0,
          failed: 1,
          manualReview: 0,
        },
      }),
      expect.anything(),
    );
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('reconciles terminal counters from the ledger before completing', async () => {
    mocks.summarizeLedger.mockResolvedValue({
      sent: 2,
      skipped: 1,
      failed: 0,
      manualReview: 0,
    });
    mocks.complete.mockResolvedValue({ outcome: 'transitioned' });

    await expect(
      finalizeEmailNotificationDeliveryRunStep(input),
    ).resolves.toEqual({ kind: 'completed' });

    expect(mocks.complete).toHaveBeenCalledWith(
      {
        runId: 'run-1',
        workflowRunId: 'workflow-1',
        ledgerSummary: { sent: 2, skipped: 1, failed: 0, manualReview: 0 },
      },
      expect.anything(),
    );
  });

  it('continues from the persisted cursor when page advance loses its CAS', async () => {
    mocks.runDelivery.mockResolvedValue({
      examined: 1,
      claimed: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
      alreadyTerminal: 0,
      inFlight: 0,
      manualReview: 0,
      recipientErrors: 0,
      nextCursor: 'user-2',
      needsReview: false,
    });
    mocks.advance.mockResolvedValue({ outcome: 'stale' });
    mocks.loadRun.mockResolvedValueOnce(runningRun).mockResolvedValueOnce({
      ...runningRun,
      cursorUserId: 'user-1',
    });

    await expect(
      processEmailNotificationDeliveryPageStep(input),
    ).resolves.toEqual({ kind: 'page_processed', nextCursor: 'user-1' });
  });

  it('retries finalization when complete loses ownership CAS but run stays owned', async () => {
    mocks.summarizeLedger.mockResolvedValue({
      sent: 1,
      skipped: 0,
      failed: 0,
      manualReview: 0,
    });
    mocks.complete.mockResolvedValue({ outcome: 'stale' });
    mocks.loadRun
      .mockResolvedValueOnce(runningRun)
      .mockResolvedValueOnce(runningRun);

    await expect(
      finalizeEmailNotificationDeliveryRunStep(input),
    ).rejects.toThrow('Email delivery run finalization retry scheduled');
  });

  it('retries a page failure when retry recording is stale but run stays owned', async () => {
    mocks.runDelivery.mockResolvedValue({
      examined: 1,
      claimed: 1,
      sent: 0,
      skipped: 0,
      failed: 1,
      alreadyTerminal: 0,
      inFlight: 0,
      manualReview: 0,
      recipientErrors: 0,
      nextCursor: 'user-1',
      needsReview: false,
      pageFailure: {
        kind: 'retryable',
        failureClass: 'provider_rate_limited',
        retryAfterMs: 60_000,
      },
    });
    mocks.recordRetry.mockResolvedValue({ outcome: 'stale' });
    mocks.loadRun
      .mockResolvedValueOnce(runningRun)
      .mockResolvedValueOnce(runningRun);

    await expect(
      processEmailNotificationDeliveryPageStep(input),
    ).rejects.toThrow('Email delivery page retry scheduled');
  });
});
