/**
 * Workflow SDK `'use workflow'` functions require static step imports; see
 * `plan-regeneration.workflow.ts`. Step modules are mocked here.
 */
import type { GenerationAttemptResult } from '@/features/plans/lifecycle/types';
import type {
  PlanRegenerationAttemptPreparation,
  PlanRegenerationWorkflowInput,
} from '@/features/plans/workflows/plan-regeneration.types';

import { toSerializableReservation } from '@/features/plans/workflows/plan-generation.types';
import { planRegenerationWorkflow } from '@/features/plans/workflows/plan-regeneration.workflow';
import { makeAttemptReservation } from '@tests/fixtures/attempts';
import { createId } from '@tests/fixtures/ids';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const workflowMocks = vi.hoisted(() => ({
  claim: vi.fn(),
  reserve: vi.fn(),
  process: vi.fn(),
  finalize: vi.fn(),
}));

vi.mock('@/features/plans/workflows/plan-regeneration.steps', () => ({
  claimPlanRegenerationJobStep: workflowMocks.claim,
  reservePlanRegenerationAttemptStep: workflowMocks.reserve,
  processPlanRegenerationStep: workflowMocks.process,
  finalizePlanRegenerationJobStep: workflowMocks.finalize,
}));

const input: PlanRegenerationWorkflowInput = {
  jobId: createId('job'),
  planId: createId('plan'),
  userId: createId('user'),
  correlationId: createId('corr'),
};

describe('planRegenerationWorkflow', () => {
  beforeEach(() => {
    workflowMocks.claim.mockReset();
    workflowMocks.reserve.mockReset();
    workflowMocks.process.mockReset();
    workflowMocks.finalize.mockReset();
  });

  it('returns early when claim is not claimed', async () => {
    workflowMocks.claim.mockResolvedValue({
      kind: 'already-completed',
      jobId: input.jobId,
    });

    const result = await planRegenerationWorkflow(input);

    expect(result).toEqual({
      kind: 'already-completed',
      jobId: input.jobId,
    });
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
    const preparation = {
      reservation: toSerializableReservation(
        makeAttemptReservation({ generationPurpose: 'regeneration' }),
      ),
      tier: 'pro',
      generationInput: {
        topic: 'Workflow regeneration',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
      },
    } satisfies PlanRegenerationAttemptPreparation;
    workflowMocks.reserve.mockResolvedValue(preparation);
    workflowMocks.process.mockResolvedValue(generationResult);
    workflowMocks.finalize.mockResolvedValue({
      kind: 'completed',
      jobId: input.jobId,
      planId: input.planId,
    });

    const result = await planRegenerationWorkflow(input);

    expect(workflowMocks.reserve).toHaveBeenCalledWith(input);
    expect(workflowMocks.process).toHaveBeenCalledWith(input, preparation);
    expect(workflowMocks.finalize).toHaveBeenCalledWith(
      input,
      generationResult,
    );
    expect(result).toEqual({
      kind: 'completed',
      jobId: input.jobId,
      planId: input.planId,
    });
  });

  it('returns a reservation failure without processing', async () => {
    workflowMocks.claim.mockResolvedValue({
      kind: 'claimed',
      runId: 'wrun_regen',
    });
    workflowMocks.reserve.mockResolvedValue({
      kind: 'retryable-failure',
      jobId: input.jobId,
      planId: input.planId,
      willRetry: true,
    });

    await expect(planRegenerationWorkflow(input)).resolves.toEqual({
      kind: 'retryable-failure',
      jobId: input.jobId,
      planId: input.planId,
      willRetry: true,
    });
    expect(workflowMocks.process).not.toHaveBeenCalled();
    expect(workflowMocks.finalize).not.toHaveBeenCalled();
  });
});
