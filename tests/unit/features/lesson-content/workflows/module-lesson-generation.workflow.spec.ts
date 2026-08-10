import type { ModuleLessonWorkflowInput } from '@/features/lesson-content/workflows/module-lesson-generation.types';

import { createModuleLessonGenerationWorkflow } from '@/features/lesson-content/workflows/module-lesson-generation.workflow';
import { createId } from '@tests/fixtures/ids';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const workflowMocks = {
  claim: vi.fn(),
  run: vi.fn(),
};

const input: ModuleLessonWorkflowInput = {
  userId: createId('user'),
  planId: createId('plan'),
  moduleId: createId('module'),
  userTier: 'free',
  correlationId: createId('corr'),
};
const workflow = createModuleLessonGenerationWorkflow(workflowMocks);

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

    const result = await workflow(input);

    expect(result).toEqual({ kind: 'locked', runId: 'wrun_test' });
  });

  it('returns the run result when claim succeeds', async () => {
    const load = { module: { id: input.moduleId }, isUnlocked: true };
    const startedAt = '2026-05-27T12:00:00.000Z';
    workflowMocks.claim.mockResolvedValue({
      kind: 'claimed',
      runId: 'wrun_test',
      load,
      startedAt,
    });
    workflowMocks.run.mockResolvedValue({
      kind: 'success',
      durationMs: 12,
      runId: 'wrun_test',
    });

    const result = await workflow(input);

    expect(result).toEqual({
      kind: 'success',
      durationMs: 12,
      runId: 'wrun_test',
    });
    expect(workflowMocks.run).toHaveBeenCalledWith(
      input,
      load,
      'wrun_test',
      startedAt,
    );
  });
});
