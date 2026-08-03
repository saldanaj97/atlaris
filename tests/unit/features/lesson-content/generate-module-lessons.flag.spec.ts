import type { DbClient } from '@/lib/db/types';

import { generateModuleLessons } from '@/features/lesson-content/generate-module-lessons';
import { runModuleLessonGenerationWork } from '@/features/lesson-content/run-module-lesson-generation-work';
import { createId } from '@tests/fixtures/ids';
import { describe, expect, it, vi } from 'vitest';

const loadContext = vi.hoisted(() => vi.fn());
const claim = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db/queries/module-lesson-generation', () => ({
  loadModuleLessonGenerationContext: loadContext,
  claimModuleLessonGenerationOrDescribe: claim,
  commitModuleLessonBatchSuccess: vi.fn(),
  commitModuleLessonGenerationFailure: vi.fn(),
  revertModuleLessonGeneratingToNotGenerated: vi.fn(),
}));

vi.mock('@supabase/service-role', () => ({
  db: {},
}));

describe('module lesson generation flag boundary', () => {
  it('generateModuleLessons returns disabled without loading context when flag is off', async () => {
    const resolveGenerationEnabled = vi.fn(async () => false);

    const result = await generateModuleLessons(
      {
        dbClient: {} as DbClient,
        userId: createId('user'),
        planId: createId('plan'),
        moduleId: createId('module'),
        userTier: 'free',
      },
      { resolveGenerationEnabled },
    );

    expect(result).toEqual({ kind: 'disabled' });
    expect(resolveGenerationEnabled).toHaveBeenCalledOnce();
    expect(loadContext).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });

  it('runModuleLessonGenerationWork returns disabled without provider or quota work when flag is off', async () => {
    const resolveGenerationEnabled = vi.fn(async () => false);
    const runLessonQuotaReserved = vi.fn();
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
        runLessonQuotaReserved,
        provider,
      },
    );

    expect(result).toEqual({ kind: 'disabled' });
    expect(resolveGenerationEnabled).toHaveBeenCalledOnce();
    expect(runLessonQuotaReserved).not.toHaveBeenCalled();
    expect(provider.generateModuleLessonBatch).not.toHaveBeenCalled();
  });

  it('generateModuleLessons proceeds past the flag when enabled', async () => {
    const resolveGenerationEnabled = vi.fn(async () => true);
    loadContext.mockResolvedValueOnce(null);

    const result = await generateModuleLessons(
      {
        dbClient: {} as DbClient,
        userId: createId('user'),
        planId: createId('plan'),
        moduleId: createId('module'),
        userTier: 'free',
      },
      { resolveGenerationEnabled },
    );

    expect(resolveGenerationEnabled).toHaveBeenCalledOnce();
    expect(loadContext).toHaveBeenCalledOnce();
    expect(result).toEqual({ kind: 'not_found' });
  });
});
