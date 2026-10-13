import type { DbClient } from '@/lib/db/types';

import { startModuleLessonGeneration } from '@/features/lesson-content/start-module-lesson-generation-workflow';
import { createId } from '@tests/fixtures/ids';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  isGenerationEnabled: vi.fn(() => true),
  loadContext: vi.fn(),
  claim: vi.fn(),
  revert: vi.fn(),
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
  dispatch: mocks.dispatch,
};

describe('startModuleLessonGeneration', () => {
  beforeEach(() => {
    mocks.isGenerationEnabled.mockReset();
    mocks.isGenerationEnabled.mockReturnValue(true);
    mocks.loadContext.mockReset();
    mocks.claim.mockReset();
    mocks.revert.mockReset();
    mocks.dispatch.mockReset();
  });

  it('returns disabled before dispatching when lesson generation is off', async () => {
    mocks.isGenerationEnabled.mockReturnValue(false);

    const result = await startModuleLessonGeneration(params, deps);

    expect(result).toEqual({ kind: 'disabled' });
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

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
      deps,
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
    expect(mocks.revert).not.toHaveBeenCalled();
  });

  it('keeps the claim and reports in_flight when the instance already exists', async () => {
    mocks.dispatch.mockResolvedValue({ kind: 'duplicate' });

    const result = await startModuleLessonGeneration(params, deps);

    expect(result).toEqual({ kind: 'in_flight' });
    expect(mocks.revert).not.toHaveBeenCalled();
  });

  it('reverts the claim and returns disabled when the Worker refuses the job', async () => {
    mocks.dispatch.mockResolvedValue({
      kind: 'disabled',
      code: 'job_disabled',
    });

    const result = await startModuleLessonGeneration(params, deps);

    expect(result).toEqual({ kind: 'disabled' });
    expectClaimReverted();
  });

  it('reverts the claim and returns workflow_start_failed when the command fails', async () => {
    mocks.dispatch.mockResolvedValue({ kind: 'failed' });

    const result = await startModuleLessonGeneration(params, deps);

    expect(result).toEqual({
      kind: 'workflow_start_failed',
      message: 'Module lesson generation could not be started.',
    });
    expectClaimReverted();
  });

  it('still returns workflow_start_failed when the revert throws', async () => {
    mocks.dispatch.mockResolvedValue({ kind: 'failed' });
    mocks.revert.mockRejectedValue(new Error('revert-fail'));

    const result = await startModuleLessonGeneration(params, deps);

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

    const result = await startModuleLessonGeneration(params, deps);

    expect(result).toEqual({ kind: 'already_ready' });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('does not dispatch when the claim is lost to a concurrent start', async () => {
    mocks.claim.mockResolvedValue({ kind: 'in_flight' });

    const result = await startModuleLessonGeneration(params, deps);

    expect(result).toEqual({ kind: 'in_flight' });
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
