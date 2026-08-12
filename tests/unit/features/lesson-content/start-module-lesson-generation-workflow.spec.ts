import type { DbClient } from '@/lib/db/types';

import { startModuleLessonGeneration } from '@/features/lesson-content/start-module-lesson-generation-workflow';
import { moduleLessonGenerationWorkflow } from '@/features/lesson-content/workflows/module-lesson-generation.workflow';
import { createId } from '@tests/fixtures/ids';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  isGenerationEnabled: vi.fn(() => true),
  loadContext: vi.fn(),
  workflowStart: vi.fn(),
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
  isGenerationEnabled: mocks.isGenerationEnabled,
  loadContext: mocks.loadContext,
  workflowStart: mocks.workflowStart,
};

describe('startModuleLessonGeneration', () => {
  beforeEach(() => {
    mocks.isGenerationEnabled.mockReset();
    mocks.isGenerationEnabled.mockReturnValue(true);
    mocks.loadContext.mockReset();
    mocks.workflowStart.mockReset();
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

  it('returns workflow_start_failed when workflow startup throws', async () => {
    mocks.loadContext.mockResolvedValue({
      module: { lessonGenerationStatus: 'not_generated' },
      isUnlocked: true,
    });
    mocks.workflowStart.mockRejectedValue(new Error('start-fail'));

    const result = await startModuleLessonGeneration(params, deps);

    expect(result).toEqual({
      kind: 'workflow_start_failed',
      message: 'Module lesson generation could not be started.',
    });
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
