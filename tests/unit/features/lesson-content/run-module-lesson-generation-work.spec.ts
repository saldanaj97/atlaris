import type { ModuleLessonGenerationContext } from '@/lib/db/queries/module-lesson-generation';
import type { DbClient } from '@/lib/db/types';

import { runModuleLessonGenerationWork } from '@/features/lesson-content/run-module-lesson-generation-work';
import { createId } from '@tests/fixtures/ids';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  commitFailure: vi.fn(),
  commitSuccess: vi.fn(),
  revertClaim: vi.fn(),
}));

vi.mock('@/lib/db/queries/module-lesson-generation', () => ({
  commitModuleLessonBatchSuccess: mocks.commitSuccess,
  commitModuleLessonGenerationFailure: mocks.commitFailure,
  revertModuleLessonGeneratingToNotGenerated: mocks.revertClaim,
}));

describe('runModuleLessonGenerationWork', () => {
  beforeEach(() => {
    mocks.revertClaim.mockReset();
    mocks.revertClaim.mockResolvedValue(undefined);
  });

  it('releases an already-claimed module when generation is disabled', async () => {
    const userId = createId('user');
    const planId = createId('plan');
    const moduleId = createId('module');
    const serverDbClient = {} as DbClient;
    const workflowRunId = 'wrun_disabled';

    await expect(
      runModuleLessonGenerationWork(
        {
          load: {} as ModuleLessonGenerationContext,
          userId,
          planId,
          moduleId,
          userTier: 'free',
          generationMetadata: {
            version: 1,
            workflow: {
              provider: 'workflow-sdk',
              runId: workflowRunId,
            },
          },
        },
        {
          serverDbClient,
          resolveGenerationEnabled: async () => false,
        },
      ),
    ).resolves.toEqual({ kind: 'disabled' });

    expect(mocks.revertClaim).toHaveBeenCalledOnce();
    expect(mocks.revertClaim).toHaveBeenCalledWith(serverDbClient, {
      userId,
      planId,
      moduleId,
      workflowRunId,
    });
  });
});
