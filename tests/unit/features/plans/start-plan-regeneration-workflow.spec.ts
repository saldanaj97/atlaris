import { startPlanRegenerationWorkflow } from '@/features/plans/start-plan-regeneration-workflow';
import { planRegenerationWorkflow } from '@/features/plans/workflows/plan-regeneration.workflow';
import { createId } from '@tests/fixtures/ids';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  isEnabled: vi.fn(() => false),
  workflowStart: vi.fn(),
  failJob: vi.fn(async () => null),
  log: {
    info: vi.fn(),
    error: vi.fn(),
  },
};

describe('startPlanRegenerationWorkflow', () => {
  const input = {
    jobId: createId('job'),
    planId: createId('plan'),
    userId: createId('user'),
    correlationId: createId('corr'),
  };

  beforeEach(() => {
    mocks.isEnabled.mockReset();
    mocks.isEnabled.mockReturnValue(false);
    mocks.workflowStart.mockReset();
    mocks.failJob.mockReset();
    mocks.failJob.mockResolvedValue(null);
    mocks.log.info.mockReset();
    mocks.log.error.mockReset();
  });

  it('no-ops when regeneration workflow flag is off', async () => {
    const result = await startPlanRegenerationWorkflow(input, {
      isEnabled: mocks.isEnabled,
      workflowStart: mocks.workflowStart,
      failJob: mocks.failJob,
      log: mocks.log,
    });

    expect(result).toEqual({ started: false });
    expect(mocks.workflowStart).not.toHaveBeenCalled();
  });

  it('starts workflow when flag is on', async () => {
    mocks.isEnabled.mockReturnValue(true);
    mocks.workflowStart.mockResolvedValue({
      runId: 'wrun_regen',
      returnValue: Promise.resolve({
        kind: 'completed',
        jobId: input.jobId,
        planId: input.planId,
      }),
    });

    const result = await startPlanRegenerationWorkflow(input, {
      isEnabled: mocks.isEnabled,
      workflowStart: mocks.workflowStart,
      failJob: mocks.failJob,
      log: mocks.log,
    });

    expect(result).toEqual({ started: true, runId: 'wrun_regen' });
    expect(mocks.workflowStart).toHaveBeenCalledWith(planRegenerationWorkflow, [
      {
        jobId: input.jobId,
        planId: input.planId,
        userId: input.userId,
        correlationId: input.correlationId,
      },
    ]);
    expect(mocks.log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId: 'wrun_regen',
        jobId: input.jobId,
      }),
      expect.stringContaining('started'),
    );
  });

  it('logs workflow startup failures without throwing', async () => {
    const error = new Error('start-failed');
    mocks.isEnabled.mockReturnValue(true);
    mocks.workflowStart.mockRejectedValue(error);

    await expect(
      startPlanRegenerationWorkflow(input, {
        isEnabled: mocks.isEnabled,
        workflowStart: mocks.workflowStart,
        failJob: mocks.failJob,
        log: mocks.log,
      }),
    ).resolves.toEqual({ started: false });

    expect(mocks.workflowStart).toHaveBeenCalledWith(planRegenerationWorkflow, [
      input,
    ]);
    expect(mocks.log.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: error,
        jobId: input.jobId,
        planId: input.planId,
        correlationId: input.correlationId,
      }),
      expect.stringContaining('failed to start'),
    );
  });

  it('terminalizes the job when returnValue rejects', async () => {
    const rejection = new Error('workflow-fatal');
    mocks.isEnabled.mockReturnValue(true);
    mocks.workflowStart.mockResolvedValue({
      runId: 'wrun_regen',
      returnValue: Promise.reject(rejection),
    });

    const result = await startPlanRegenerationWorkflow(input, {
      isEnabled: mocks.isEnabled,
      workflowStart: mocks.workflowStart,
      failJob: mocks.failJob,
      log: mocks.log,
    });

    expect(result).toEqual({ started: true, runId: 'wrun_regen' });
    await vi.waitFor(() => {
      expect(mocks.failJob).toHaveBeenCalledWith(
        input.jobId,
        'Queued plan regeneration failed.',
        { retryable: false },
      );
    });
    expect(mocks.log.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: rejection,
        workflowRunId: 'wrun_regen',
      }),
      expect.stringContaining('workflow failed'),
    );
  });

  it('does not fail the job when returnValue resolves in-flight', async () => {
    mocks.isEnabled.mockReturnValue(true);
    mocks.workflowStart.mockResolvedValue({
      runId: 'wrun_regen',
      returnValue: Promise.resolve({
        kind: 'in-flight',
        jobId: input.jobId,
        runId: 'other-run',
      }),
    });

    const result = await startPlanRegenerationWorkflow(input, {
      isEnabled: mocks.isEnabled,
      workflowStart: mocks.workflowStart,
      failJob: mocks.failJob,
      log: mocks.log,
    });

    expect(result).toEqual({ started: true, runId: 'wrun_regen' });
    await Promise.resolve();
    expect(mocks.failJob).not.toHaveBeenCalled();
  });
});
