/**
 * Workflow SDK `'use workflow'` functions require static step imports; see
 * `module-lesson-generation.workflow.ts`. Step modules are mocked here.
 */
import type { ModuleLessonWorkflowInput } from '@/features/lesson-content/workflows/module-lesson-generation.types';

import { moduleLessonGenerationWorkflow } from '@/features/lesson-content/workflows/module-lesson-generation.workflow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const workflowMocks = vi.hoisted(() => ({
  claim: vi.fn(),
  run: vi.fn(),
}));

vi.mock(
  '@/features/lesson-content/workflows/module-lesson-generation.steps',
  () => ({
    claimModuleLessonGenerationStep: workflowMocks.claim,
    runModuleLessonGenerationStep: workflowMocks.run,
  }),
);

const input: ModuleLessonWorkflowInput = {
  userId: 'user-1',
  planId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  moduleId: '7f9c2f8d-1a9b-4f6e-9f6c-2b2c3d479abc',
  userTier: 'free',
  correlationId: 'corr-1',
};

describe('moduleLessonGenerationWorkflow', () => {
  beforeEach(() => {
    workflowMocks.claim.mockReset();
    workflowMocks.run.mockReset();
  });

  it('returns non-claimed claim results without running generation', async () => {
    workflowMocks.claim.mockResolvedValue({
      kind: 'locked',
      runId: 'wrun_test',
    });

    const result = await moduleLessonGenerationWorkflow(input);

    expect(result).toEqual({ kind: 'locked', runId: 'wrun_test' });
    expect(workflowMocks.run).not.toHaveBeenCalled();
  });

  it('delegates to run step on happy path with load from claim', async () => {
    const load = { module: { id: input.moduleId }, isUnlocked: true };
    workflowMocks.claim.mockResolvedValue({
      kind: 'claimed',
      runId: 'wrun_test',
      load,
    });
    workflowMocks.run.mockResolvedValue({
      kind: 'success',
      durationMs: 12,
      runId: 'wrun_test',
    });

    const result = await moduleLessonGenerationWorkflow(input);

    expect(workflowMocks.run).toHaveBeenCalledWith(input, load, 'wrun_test');
    expect(result).toEqual({
      kind: 'success',
      durationMs: 12,
      runId: 'wrun_test',
    });
  });
});
