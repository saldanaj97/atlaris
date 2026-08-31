import type { DbClient } from '@/lib/db/types';

import { runModuleLessonGenerationWork } from '@/features/lesson-content/run-module-lesson-generation-work';
import { startModuleLessonGeneration } from '@/features/lesson-content/start-module-lesson-generation-workflow';
import { createId } from '@tests/fixtures/ids';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/queries/module-lesson-generation', () => ({
  loadModuleLessonGenerationContext: vi.fn(),
  claimModuleLessonGenerationOrDescribe: vi.fn(),
  commitModuleLessonBatchSuccess: vi.fn(),
  commitModuleLessonGenerationFailure: vi.fn(),
  revertModuleLessonGeneratingToNotGenerated: vi.fn(),
}));

vi.mock('@supabase/service-role', () => ({
  db: {},
}));

describe('module lesson generation flag boundary', () => {
  it('startModuleLessonGeneration returns disabled without loading context when flag is off', async () => {
    const isGenerationEnabled = vi.fn(async () => false);
    const loadContext = vi.fn();
    const claim = vi.fn();
    const workflowStart = vi.fn();

    const result = await startModuleLessonGeneration(
      {
        dbClient: {} as DbClient,
        userId: createId('user'),
        planId: createId('plan'),
        moduleId: createId('module'),
        userTier: 'free',
        correlationId: createId('corr'),
      },
      { isGenerationEnabled, loadContext, claim, workflowStart },
    );

    expect(result).toEqual({ kind: 'disabled' });
    expect(isGenerationEnabled).toHaveBeenCalledOnce();
    expect(loadContext).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
    expect(workflowStart).not.toHaveBeenCalled();
  });

  it('runModuleLessonGenerationWork returns disabled without provider work when flag is off', async () => {
    const resolveGenerationEnabled = vi.fn(async () => false);
    const provider = {
      generateModuleLessonBatch: vi.fn(),
    };

    const result = await runModuleLessonGenerationWork(
      {
        load: {
          plan: {
            topic: 't',
            skillLevel: 'beginner',
            learningStyle: 'mixed',
          },
          module: {
            title: 'm',
            description: null,
            order: 1,
          },
          tasks: [{ id: createId('task'), title: 'Task', order: 1 }],
          isUnlocked: true,
        } as never,
        userId: createId('user'),
        planId: createId('plan'),
        moduleId: createId('module'),
        userTier: 'free',
      },
      {
        resolveGenerationEnabled,
        provider,
      },
    );

    expect(result).toEqual({ kind: 'disabled' });
    expect(resolveGenerationEnabled).toHaveBeenCalledOnce();
    expect(provider.generateModuleLessonBatch).not.toHaveBeenCalled();
  });

  it('startModuleLessonGeneration proceeds past the flag when enabled', async () => {
    const isGenerationEnabled = vi.fn(async () => true);
    const loadContext = vi.fn().mockResolvedValueOnce(null);
    const claim = vi.fn();
    const workflowStart = vi.fn();

    const result = await startModuleLessonGeneration(
      {
        dbClient: {} as DbClient,
        userId: createId('user'),
        planId: createId('plan'),
        moduleId: createId('module'),
        userTier: 'free',
        correlationId: createId('corr'),
      },
      { isGenerationEnabled, loadContext, claim, workflowStart },
    );

    expect(isGenerationEnabled).toHaveBeenCalledOnce();
    expect(loadContext).toHaveBeenCalledOnce();
    expect(result).toEqual({ kind: 'not_found' });
    expect(claim).not.toHaveBeenCalled();
    expect(workflowStart).not.toHaveBeenCalled();
  });
});
