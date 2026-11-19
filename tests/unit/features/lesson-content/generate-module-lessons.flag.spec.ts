import type { DbClient } from '@/lib/db/types';

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
    const dispatch = vi.fn();

    const result = await startModuleLessonGeneration(
      {
        dbClient: {} as DbClient,
        userId: createId('user'),
        planId: createId('plan'),
        moduleId: createId('module'),
        correlationId: createId('corr'),
      },
      { isGenerationEnabled, loadContext, claim, dispatch },
    );

    expect(result).toEqual({ kind: 'disabled' });
    expect(isGenerationEnabled).toHaveBeenCalledOnce();
    expect(loadContext).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('startModuleLessonGeneration proceeds past the flag when enabled', async () => {
    const isGenerationEnabled = vi.fn(async () => true);
    const loadContext = vi.fn().mockResolvedValueOnce(null);
    const claim = vi.fn();
    const dispatch = vi.fn();

    const result = await startModuleLessonGeneration(
      {
        dbClient: {} as DbClient,
        userId: createId('user'),
        planId: createId('plan'),
        moduleId: createId('module'),
        correlationId: createId('corr'),
      },
      { isGenerationEnabled, loadContext, claim, dispatch },
    );

    expect(isGenerationEnabled).toHaveBeenCalledOnce();
    expect(loadContext).toHaveBeenCalledOnce();
    expect(result).toEqual({ kind: 'not_found' });
    expect(claim).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
