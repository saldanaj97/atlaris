import type { DbClient } from '@/lib/db/types';

import { startModuleLessonGeneration } from '@/features/lesson-content/start-module-lesson-generation-workflow';
import { moduleLessonGenerationWorkflow } from '@/features/lesson-content/workflows/module-lesson-generation.workflow';
import { createId } from '@tests/fixtures/ids';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  isWorkflowEnabled: vi.fn(() => false),
  isGenerationEnabled: vi.fn(() => true),
  loadContext: vi.fn(),
  workflowStart: vi.fn(),
  generateFn: vi.fn(),
};

const params = {
  dbClient: {} as DbClient,
  userId: createId('user'),
  planId: createId('plan'),
  moduleId: createId('module'),
  userTier: 'free' as const,
  correlationId: createId('corr'),
};

const deps = {
  isWorkflowEnabled: mocks.isWorkflowEnabled,
  isGenerationEnabled: mocks.isGenerationEnabled,
  loadContext: mocks.loadContext,
  workflowStart: mocks.workflowStart,
  generateFn: mocks.generateFn,
};

describe('startModuleLessonGeneration', () => {
  beforeEach(() => {
    mocks.isWorkflowEnabled.mockReset();
    mocks.isWorkflowEnabled.mockReturnValue(false);
    mocks.isGenerationEnabled.mockReset();
    mocks.isGenerationEnabled.mockReturnValue(true);
    mocks.loadContext.mockReset();
    mocks.workflowStart.mockReset();
    mocks.generateFn.mockReset();
  });

  it('uses synchronous generation when workflow flag is off', async () => {
    mocks.generateFn.mockResolvedValue({
      kind: 'success',
      durationMs: 1,
    });

    const result = await startModuleLessonGeneration(params, deps);

    expect(mocks.generateFn).toHaveBeenCalled();
    expect(mocks.workflowStart).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: 'success', durationMs: 1 });
  });

  it('returns disabled before starting workflow when lesson generation is off', async () => {
    mocks.isWorkflowEnabled.mockReturnValue(true);
    mocks.isGenerationEnabled.mockReturnValue(false);

    const result = await startModuleLessonGeneration(params, deps);

    expect(result).toEqual({ kind: 'disabled' });
    expect(mocks.workflowStart).not.toHaveBeenCalled();
  });

  it('starts workflow when preflight passes', async () => {
    mocks.isWorkflowEnabled.mockReturnValue(true);
    mocks.loadContext.mockResolvedValue({
      module: { lessonGenerationStatus: 'not_generated' },
      isUnlocked: true,
    });
    mocks.workflowStart.mockResolvedValue({ runId: 'wrun_lesson' });

    const result = await startModuleLessonGeneration(params, deps);

    expect(result).toEqual({ kind: 'workflow_started', runId: 'wrun_lesson' });
    expect(mocks.workflowStart).toHaveBeenCalledWith(
      moduleLessonGenerationWorkflow,
      [
        expect.objectContaining({
          userId: params.userId,
          planId: params.planId,
          moduleId: params.moduleId,
          userTier: 'free',
          correlationId: params.correlationId,
        }),
      ],
    );
  });

  it('surfaces workflow startup failures', async () => {
    const error = new Error('start-fail');
    mocks.isWorkflowEnabled.mockReturnValue(true);
    mocks.loadContext.mockResolvedValue({
      module: { lessonGenerationStatus: 'not_generated' },
      isUnlocked: true,
    });
    mocks.workflowStart.mockRejectedValue(error);

    await expect(startModuleLessonGeneration(params, deps)).rejects.toThrow(
      error,
    );
    expect(mocks.workflowStart).toHaveBeenCalledWith(
      moduleLessonGenerationWorkflow,
      [
        expect.objectContaining({
          userId: params.userId,
          planId: params.planId,
          moduleId: params.moduleId,
          userTier: 'free',
          correlationId: params.correlationId,
        }),
      ],
    );
  });
});
