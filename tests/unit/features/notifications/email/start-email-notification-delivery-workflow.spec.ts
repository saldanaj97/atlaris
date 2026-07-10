import { startEmailNotificationDeliveryWorkflow } from '@/features/notifications/email/start-email-notification-delivery-workflow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const run = {
  id: 'run-1',
  runKind: 'daily',
  schedulerDateUtc: '2026-07-10',
  referenceTimestampUtc: new Date('2026-07-10T14:00:00.000Z'),
  status: 'queued',
  workflowRunId: null,
};

const mocks = {
  reserve: vi.fn(),
  loadByKey: vi.fn(),
  prepare: vi.fn(),
  countManualReviews: vi.fn(),
  workflowStart: vi.fn(),
  fail: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
};

const deps = {
  dbClient: {} as never,
  reserve: mocks.reserve,
  loadByKey: mocks.loadByKey,
  prepare: mocks.prepare,
  countManualReviews: mocks.countManualReviews,
  workflowStart: mocks.workflowStart,
  failRun: mocks.fail,
  log: mocks.log,
};

describe('startEmailNotificationDeliveryWorkflow', () => {
  beforeEach(() => {
    mocks.reserve.mockReset();
    mocks.loadByKey.mockReset();
    mocks.prepare.mockReset();
    mocks.countManualReviews.mockReset();
    mocks.workflowStart.mockReset();
    mocks.fail.mockReset();
    mocks.log.info.mockReset();
    mocks.log.warn.mockReset();
    mocks.log.error.mockReset();
  });

  it('reserves a logical run once and starts its workflow asynchronously', async () => {
    mocks.reserve.mockResolvedValue({ outcome: 'reserved', run });
    mocks.workflowStart.mockResolvedValue({ runId: 'workflow-1' });

    await expect(
      startEmailNotificationDeliveryWorkflow(
        { runKind: 'daily', schedulerDateUtc: '2026-07-10', action: 'start' },
        deps,
      ),
    ).resolves.toEqual({
      outcome: 'started',
      runId: 'run-1',
      workflowRunId: 'workflow-1',
    });

    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        runKind: 'daily',
        schedulerDateUtc: '2026-07-10',
        referenceTimestampUtc: new Date('2026-07-10T14:00:00.000Z'),
      }),
      expect.anything(),
    );
  });

  it('returns an existing queued run without starting a duplicate workflow', async () => {
    mocks.reserve.mockResolvedValue({ outcome: 'existing', run });

    await expect(
      startEmailNotificationDeliveryWorkflow(
        { runKind: 'daily', schedulerDateUtc: '2026-07-10', action: 'start' },
        deps,
      ),
    ).resolves.toEqual({
      outcome: 'already_running',
      runId: 'run-1',
      workflowRunId: null,
    });

    expect(mocks.workflowStart).not.toHaveBeenCalled();
  });

  it('leaves a recoverable failed run when Workflow SDK cannot start it', async () => {
    mocks.reserve.mockResolvedValue({ outcome: 'reserved', run });
    mocks.workflowStart.mockRejectedValue(new Error('workflow unavailable'));
    mocks.fail.mockResolvedValue({ outcome: 'transitioned' });

    await expect(
      startEmailNotificationDeliveryWorkflow(
        { runKind: 'daily', schedulerDateUtc: '2026-07-10', action: 'start' },
        deps,
      ),
    ).resolves.toEqual({
      outcome: 'failed_requires_resume',
      runId: 'run-1',
      workflowRunId: null,
    });

    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        workflowRunId: null,
        errorClass: 'workflow_start_failed',
      }),
      expect.anything(),
    );
    expect(mocks.log.error.mock.calls[0]?.[0]).not.toHaveProperty('err');
  });

  it('does not replay reviewed work while manual-review ledger rows remain', async () => {
    mocks.loadByKey.mockResolvedValue({
      ...run,
      status: 'needs_review',
    });
    mocks.countManualReviews.mockResolvedValue(1);

    await expect(
      startEmailNotificationDeliveryWorkflow(
        {
          runKind: 'daily',
          schedulerDateUtc: '2026-07-10',
          action: 'replay_reviewed',
        },
        deps,
      ),
    ).resolves.toEqual({
      outcome: 'needs_review',
      runId: 'run-1',
      workflowRunId: null,
    });

    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.workflowStart).not.toHaveBeenCalled();
  });
});
