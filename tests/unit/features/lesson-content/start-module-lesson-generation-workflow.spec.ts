import type { DbClient } from '@/lib/db/types';

import { startModuleLessonGeneration } from '@/features/lesson-content/start-module-lesson-generation-workflow';
import { moduleLessonGenerationWorkflow } from '@/features/lesson-content/workflows/module-lesson-generation.workflow';
import { createId } from '@tests/fixtures/ids';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  isGenerationEnabled: vi.fn(() => true),
  loadContext: vi.fn(),
  claim: vi.fn(),
  revert: vi.fn(),
  workflowStart: vi.fn(),
  dispatch: vi.fn(),
};

const params = {
  dbClient: {} as DbClient,
  userId: createId('user'),
  planId: createId('plan'),
  moduleId: createId('module'),
  correlationId: createId('corr'),
};

const deps = {
  dbClient: params.dbClient,
  isGenerationEnabled: mocks.isGenerationEnabled,
  loadContext: mocks.loadContext,
  claim: mocks.claim,
  revert: mocks.revert,
  workflowStart: mocks.workflowStart,
  runtime: () => 'vercel' as const,
};

describe('startModuleLessonGeneration', () => {
  beforeEach(() => {
    mocks.isGenerationEnabled.mockReset();
    mocks.isGenerationEnabled.mockReturnValue(true);
    mocks.loadContext.mockReset();
    mocks.claim.mockReset();
    mocks.revert.mockReset();
    mocks.workflowStart.mockReset();
    mocks.dispatch.mockReset();
  });

  it('returns disabled before starting workflow when lesson generation is off', async () => {
    mocks.isGenerationEnabled.mockReturnValue(false);

    const result = await startModuleLessonGeneration(params, deps);

    expect(result).toEqual({ kind: 'disabled' });
    expect(mocks.workflowStart).not.toHaveBeenCalled();
  });

  it('starts workflow when preflight passes', async () => {
    mocks.loadContext.mockResolvedValue({
      module: { lessonGenerationStatus: 'not_generated' },
      isUnlocked: true,
    });
    mocks.claim.mockResolvedValue({
      kind: 'claimed',
      workflowStartedAt: null,
    });
    mocks.workflowStart.mockResolvedValue({
      runId: 'wrun_lesson',
      returnValue: new Promise(() => {}),
    });

    const result = await startModuleLessonGeneration(params, deps);

    expect(result).toEqual({ kind: 'workflow_started', runId: 'wrun_lesson' });
    expect(mocks.claim).toHaveBeenCalledWith(
      params.dbClient,
      params.planId,
      params.moduleId,
      params.userId,
      { batchRequestId: params.correlationId },
    );
    expect(mocks.workflowStart).toHaveBeenCalledWith(
      moduleLessonGenerationWorkflow,
      [
        expect.objectContaining({
          userId: params.userId,
          planId: params.planId,
          moduleId: params.moduleId,
          correlationId: params.correlationId,
        }),
      ],
    );
    expect(mocks.workflowStart.mock.calls[0]?.[1]?.[0]).not.toHaveProperty(
      'userTier',
    );
  });

  it('reverts an adopted claim when the workflow later rejects', async () => {
    mocks.loadContext.mockResolvedValue({
      module: { lessonGenerationStatus: 'not_generated' },
      isUnlocked: true,
    });
    mocks.claim.mockResolvedValue({
      kind: 'claimed',
      workflowStartedAt: null,
    });
    let rejectWorkflow!: (error: Error) => void;
    const returnValue = new Promise((_, reject) => {
      rejectWorkflow = reject;
    });
    mocks.workflowStart.mockResolvedValue({
      runId: 'wrun_lesson',
      returnValue,
    });

    const result = await startModuleLessonGeneration(params, deps);

    expect(result).toEqual({ kind: 'workflow_started', runId: 'wrun_lesson' });
    rejectWorkflow(new Error('workflow-fail'));
    await vi.waitFor(() => {
      expect(mocks.revert).toHaveBeenCalledWith(params.dbClient, {
        userId: params.userId,
        planId: params.planId,
        moduleId: params.moduleId,
        workflowRunId: 'wrun_lesson',
        batchRequestId: params.correlationId,
      });
    });
  });

  it('returns workflow_start_failed when workflow startup throws', async () => {
    mocks.loadContext.mockResolvedValue({
      module: { lessonGenerationStatus: 'not_generated' },
      isUnlocked: true,
    });
    mocks.claim.mockResolvedValue({
      kind: 'claimed',
      workflowStartedAt: null,
    });
    mocks.workflowStart.mockRejectedValue(new Error('start-fail'));

    const result = await startModuleLessonGeneration(params, deps);

    expect(result).toEqual({
      kind: 'workflow_start_failed',
      message: 'Module lesson generation could not be started.',
    });
    expect(mocks.revert).toHaveBeenCalledWith(params.dbClient, {
      userId: params.userId,
      planId: params.planId,
      moduleId: params.moduleId,
      batchRequestId: params.correlationId,
    });
    expect(mocks.workflowStart).toHaveBeenCalledWith(
      moduleLessonGenerationWorkflow,
      [
        expect.objectContaining({
          userId: params.userId,
          planId: params.planId,
          moduleId: params.moduleId,
          correlationId: params.correlationId,
        }),
      ],
    );
    expect(mocks.workflowStart.mock.calls[0]?.[1]?.[0]).not.toHaveProperty(
      'userTier',
    );
  });

  it('claims before start and does not start a rival overlapping workflow', async () => {
    mocks.loadContext.mockResolvedValue({
      module: { lessonGenerationStatus: 'not_generated' },
      isUnlocked: true,
    });
    mocks.claim
      .mockResolvedValueOnce({ kind: 'claimed', workflowStartedAt: null })
      .mockResolvedValueOnce({ kind: 'in_flight' });

    let releaseWorkflowStart!: () => void;
    const workflowStartBlocked = new Promise<void>((resolve) => {
      releaseWorkflowStart = resolve;
    });
    mocks.workflowStart.mockImplementation(async () => {
      await workflowStartBlocked;
      return { runId: 'wrun_lesson', returnValue: new Promise(() => {}) };
    });

    const resultsPromise = Promise.all([
      startModuleLessonGeneration(params, deps),
      startModuleLessonGeneration(
        { ...params, correlationId: 'corr-rival' },
        deps,
      ),
    ]);

    await vi.waitFor(() => {
      expect(mocks.workflowStart).toHaveBeenCalledOnce();
    });
    releaseWorkflowStart();

    await expect(resultsPromise).resolves.toEqual([
      { kind: 'workflow_started', runId: 'wrun_lesson' },
      { kind: 'in_flight' },
    ]);
    expect(mocks.workflowStart).toHaveBeenCalledOnce();
  });

  describe('with MODULE_LESSONS_RUNTIME=cloudflare', () => {
    const workerDeps = {
      ...deps,
      runtime: () => 'cloudflare' as const,
      dispatch: mocks.dispatch,
    };

    beforeEach(() => {
      mocks.loadContext.mockResolvedValue({
        module: { lessonGenerationStatus: 'not_generated' },
        isUnlocked: true,
      });
      mocks.claim.mockResolvedValue({
        kind: 'claimed',
        workflowStartedAt: null,
      });
    });

    function expectClaimReverted() {
      expect(mocks.revert).toHaveBeenCalledOnce();
      expect(mocks.revert).toHaveBeenCalledWith(params.dbClient, {
        userId: params.userId,
        planId: params.planId,
        moduleId: params.moduleId,
        batchRequestId: params.correlationId,
      });
    }

    it('sends the claim to the jobs Worker and returns its instance ID', async () => {
      mocks.dispatch.mockResolvedValue({
        kind: 'accepted',
        instanceId: 'lessons-instance',
      });

      const result = await startModuleLessonGeneration(
        { ...params, modelOverride: 'openrouter/model' },
        workerDeps,
      );

      expect(result).toEqual({
        kind: 'workflow_started',
        runId: 'lessons-instance',
      });
      expect(mocks.claim).toHaveBeenCalledWith(
        params.dbClient,
        params.planId,
        params.moduleId,
        params.userId,
        { batchRequestId: params.correlationId },
      );
      expect(mocks.dispatch).toHaveBeenCalledWith({
        planId: params.planId,
        moduleId: params.moduleId,
        userId: params.userId,
        batchRequestId: params.correlationId,
        correlationId: params.correlationId,
        modelOverride: 'openrouter/model',
      });
      expect(mocks.workflowStart).not.toHaveBeenCalled();
      expect(mocks.revert).not.toHaveBeenCalled();
    });

    it('keeps the claim and reports in_flight when the instance already exists', async () => {
      mocks.dispatch.mockResolvedValue({ kind: 'duplicate' });

      const result = await startModuleLessonGeneration(params, workerDeps);

      expect(result).toEqual({ kind: 'in_flight' });
      expect(mocks.revert).not.toHaveBeenCalled();
      expect(mocks.workflowStart).not.toHaveBeenCalled();
    });

    it('reverts the claim and returns disabled when the Worker refuses the job', async () => {
      mocks.dispatch.mockResolvedValue({
        kind: 'disabled',
        code: 'job_disabled',
      });

      const result = await startModuleLessonGeneration(params, workerDeps);

      expect(result).toEqual({ kind: 'disabled' });
      expectClaimReverted();
      expect(mocks.workflowStart).not.toHaveBeenCalled();
    });

    it('reverts the claim and returns workflow_start_failed when the command fails', async () => {
      mocks.dispatch.mockResolvedValue({ kind: 'failed' });

      const result = await startModuleLessonGeneration(params, workerDeps);

      expect(result).toEqual({
        kind: 'workflow_start_failed',
        message: 'Module lesson generation could not be started.',
      });
      expectClaimReverted();
      expect(mocks.workflowStart).not.toHaveBeenCalled();
    });

    it('still returns workflow_start_failed when the revert throws', async () => {
      mocks.dispatch.mockResolvedValue({ kind: 'failed' });
      mocks.revert.mockRejectedValue(new Error('revert-fail'));

      const result = await startModuleLessonGeneration(params, workerDeps);

      expect(result).toEqual({
        kind: 'workflow_start_failed',
        message: 'Module lesson generation could not be started.',
      });
      expectClaimReverted();
    });

    it('does not claim or dispatch when the module is not eligible', async () => {
      mocks.loadContext.mockResolvedValue({
        module: { lessonGenerationStatus: 'ready' },
        isUnlocked: true,
      });

      const result = await startModuleLessonGeneration(params, workerDeps);

      expect(result).toEqual({ kind: 'already_ready' });
      expect(mocks.claim).not.toHaveBeenCalled();
      expect(mocks.dispatch).not.toHaveBeenCalled();
    });

    it('does not dispatch when the claim is lost to a concurrent start', async () => {
      mocks.claim.mockResolvedValue({ kind: 'in_flight' });

      const result = await startModuleLessonGeneration(params, workerDeps);

      expect(result).toEqual({ kind: 'in_flight' });
      expect(mocks.dispatch).not.toHaveBeenCalled();
    });
  });
});
