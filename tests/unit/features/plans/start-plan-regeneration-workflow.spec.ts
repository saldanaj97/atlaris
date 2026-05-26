import { startPlanRegenerationWorkflow } from '@/features/plans/start-plan-regeneration-workflow';
import { planRegenerationWorkflow } from '@/features/plans/workflows/plan-regeneration.workflow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  isEnabled: vi.fn(() => false),
  workflowStart: vi.fn(),
  log: {
    info: vi.fn(),
    error: vi.fn(),
  },
};

describe('startPlanRegenerationWorkflow', () => {
  beforeEach(() => {
    mocks.isEnabled.mockReset();
    mocks.isEnabled.mockReturnValue(false);
    mocks.workflowStart.mockReset();
    mocks.log.info.mockReset();
    mocks.log.error.mockReset();
  });

  it('no-ops when regeneration workflow flag is off', async () => {
    await startPlanRegenerationWorkflow(
      {
        jobId: 'job-1',
        planId: 'plan-1',
        userId: 'user-1',
        correlationId: 'corr-1',
      },
      {
        isEnabled: mocks.isEnabled,
        workflowStart: mocks.workflowStart,
        log: mocks.log,
      },
    );

    expect(mocks.workflowStart).not.toHaveBeenCalled();
  });

  it('starts workflow when flag is on', async () => {
    mocks.isEnabled.mockReturnValue(true);
    mocks.workflowStart.mockResolvedValue({
      runId: 'wrun_regen',
      returnValue: Promise.resolve({
        kind: 'completed',
        jobId: 'job-1',
        planId: 'plan-1',
      }),
    });

    await startPlanRegenerationWorkflow(
      {
        jobId: 'job-1',
        planId: 'plan-1',
        userId: 'user-1',
        correlationId: 'corr-2',
      },
      {
        isEnabled: mocks.isEnabled,
        workflowStart: mocks.workflowStart,
        log: mocks.log,
      },
    );

    expect(mocks.workflowStart).toHaveBeenCalledWith(planRegenerationWorkflow, [
      {
        jobId: 'job-1',
        planId: 'plan-1',
        userId: 'user-1',
        correlationId: 'corr-2',
      },
    ]);
    expect(mocks.log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId: 'wrun_regen',
        jobId: 'job-1',
      }),
      expect.stringContaining('started'),
    );
  });
});
