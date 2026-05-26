/**
 * Workflow SDK `'use workflow'` functions require static step imports; see
 * `plan-regeneration.workflow.ts`. Step modules are mocked here.
 */
import type { GenerationAttemptResult } from '@/features/plans/lifecycle/types';
import type { PlanRegenerationWorkflowInput } from '@/features/plans/workflows/plan-regeneration.types';

import { planRegenerationWorkflow } from '@/features/plans/workflows/plan-regeneration.workflow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const workflowMocks = vi.hoisted(() => ({
  claim: vi.fn(),
  process: vi.fn(),
  finalize: vi.fn(),
}));

vi.mock('@/features/plans/workflows/plan-regeneration.steps', () => ({
  claimPlanRegenerationJobStep: workflowMocks.claim,
  processPlanRegenerationStep: workflowMocks.process,
  finalizePlanRegenerationJobStep: workflowMocks.finalize,
}));

const input: PlanRegenerationWorkflowInput = {
  jobId: 'job-1',
  planId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  userId: 'user-1',
  correlationId: 'corr-regen',
};

describe('planRegenerationWorkflow', () => {
  beforeEach(() => {
    workflowMocks.claim.mockReset();
    workflowMocks.process.mockReset();
    workflowMocks.finalize.mockReset();
  });

  it('returns early when claim is not claimed', async () => {
    workflowMocks.claim.mockResolvedValue({
      kind: 'already-completed',
      jobId: 'job-1',
    });

    const result = await planRegenerationWorkflow(input);

    expect(result).toEqual({ kind: 'already-completed', jobId: 'job-1' });
    expect(workflowMocks.process).not.toHaveBeenCalled();
    expect(workflowMocks.finalize).not.toHaveBeenCalled();
  });

  it('runs process and finalize when claim succeeds', async () => {
    const generationResult = {
      status: 'generation_success',
      data: { modules: [], durationMs: 0, metadata: {} },
    } satisfies GenerationAttemptResult;

    workflowMocks.claim.mockResolvedValue({
      kind: 'claimed',
      runId: 'wrun_regen',
    });
    workflowMocks.process.mockResolvedValue(generationResult);
    workflowMocks.finalize.mockResolvedValue({
      kind: 'completed',
      jobId: 'job-1',
      planId: input.planId,
    });

    const result = await planRegenerationWorkflow(input);

    expect(workflowMocks.process).toHaveBeenCalledWith(input);
    expect(workflowMocks.finalize).toHaveBeenCalledWith(
      input,
      generationResult,
    );
    expect(result).toEqual({
      kind: 'completed',
      jobId: 'job-1',
      planId: input.planId,
    });
  });
});
