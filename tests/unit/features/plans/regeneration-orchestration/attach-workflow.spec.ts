import type { RegenerationOrchestrationDeps } from '@/features/plans/regeneration-orchestration/deps';
import type { PlanRegenerationJobPayload } from '@/features/plans/regeneration-orchestration/schema';

import { attachPlanRegenerationWorkflow } from '@/features/plans/regeneration-orchestration/attach-workflow';
import { makeRegenerationOrchestrationDeps } from '@tests/helpers/regeneration-orchestration-deps';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const startPlanRegenerationWorkflowMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/plans/start-plan-regeneration-workflow', () => ({
  startPlanRegenerationWorkflow: startPlanRegenerationWorkflowMock,
}));

const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const jobId = 'job-1';
const userId = 'user-1';
const correlationId = 'regen-attach-test';

const basePayload: PlanRegenerationJobPayload = { planId };

function makeDeps(
  overrides: {
    updateRegenerationJobPayload?: RegenerationOrchestrationDeps['queue']['updateRegenerationJobPayload'];
    failJob?: RegenerationOrchestrationDeps['queue']['failJob'];
  } = {},
) {
  return makeRegenerationOrchestrationDeps({ queue: overrides }).queue;
}

describe('attachPlanRegenerationWorkflow', () => {
  beforeEach(() => {
    startPlanRegenerationWorkflowMock.mockReset();
    startPlanRegenerationWorkflowMock.mockResolvedValue({
      started: true,
      runId: 'wrun_attach',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns already-attached when payload already has workflow.runId', async () => {
    const payload: PlanRegenerationJobPayload = {
      planId,
      workflow: {
        provider: 'workflow-sdk',
        runId: 'wrun_existing',
      },
    };
    const deps = makeDeps();

    const result = await attachPlanRegenerationWorkflow(
      { jobId, planId, userId, payload, correlationId },
      deps,
    );

    expect(result).toEqual({ kind: 'already-attached' });
    expect(startPlanRegenerationWorkflowMock).not.toHaveBeenCalled();
    expect(deps.updateRegenerationJobPayload).not.toHaveBeenCalled();
  });

  it('returns start-failed when workflow start does not succeed', async () => {
    startPlanRegenerationWorkflowMock.mockResolvedValue({ started: false });
    const cancelWorkflow = vi.fn(async () => true);
    const deps = makeDeps();

    const result = await attachPlanRegenerationWorkflow(
      { jobId, planId, userId, payload: basePayload, correlationId },
      deps,
      { cancelWorkflow },
    );

    expect(result).toEqual({ kind: 'start-failed' });
    expect(deps.updateRegenerationJobPayload).not.toHaveBeenCalled();
    expect(cancelWorkflow).not.toHaveBeenCalled();
  });

  it('persists runId and returns attached on the happy path', async () => {
    const updateRegenerationJobPayload = vi.fn(async () => null);
    const cancelWorkflow = vi.fn(async () => true);
    const deps = makeDeps({ updateRegenerationJobPayload });

    const result = await attachPlanRegenerationWorkflow(
      { jobId, planId, userId, payload: basePayload, correlationId },
      deps,
      { cancelWorkflow },
    );

    expect(result).toEqual({ kind: 'attached', runId: 'wrun_attach' });
    expect(startPlanRegenerationWorkflowMock).toHaveBeenCalledTimes(1);
    expect(updateRegenerationJobPayload).toHaveBeenCalledWith(
      jobId,
      expect.objectContaining({
        planId,
        workflow: expect.objectContaining({
          provider: 'workflow-sdk',
          runId: 'wrun_attach',
          startedAt: expect.any(String),
        }),
      }),
    );
    expect(cancelWorkflow).not.toHaveBeenCalled();
  });

  it('cancels the started run and rethrows when persist fails after start', async () => {
    const persistError = new Error('runId persist failed');
    const updateRegenerationJobPayload = vi.fn(async () => {
      throw persistError;
    });
    const cancelWorkflow = vi.fn(async () => true);
    const deps = makeDeps({ updateRegenerationJobPayload });

    await expect(
      attachPlanRegenerationWorkflow(
        { jobId, planId, userId, payload: basePayload, correlationId },
        deps,
        { cancelWorkflow },
      ),
    ).rejects.toThrow('runId persist failed');

    expect(cancelWorkflow).toHaveBeenCalledTimes(1);
    expect(cancelWorkflow).toHaveBeenCalledWith('wrun_attach');
  });
});
