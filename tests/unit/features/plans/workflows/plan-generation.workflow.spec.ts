/**
 * Workflow SDK `'use workflow'` functions require static step imports; see
 * `plan-generation.workflow.ts`. Step modules are mocked here.
 */
import type { GenerationAttemptResult } from '@/features/plans/lifecycle/types';
import type { PlanGenerationWorkflowInput } from '@/features/plans/workflows/plan-generation.types';

import { planGenerationWorkflow } from '@/features/plans/workflows/plan-generation.workflow';
import { makeAttemptReservation } from '@tests/fixtures/attempts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const workflowMocks = vi.hoisted(() => ({
  persistMetadata: vi.fn(),
  runGeneration: vi.fn(),
}));

vi.mock('@/features/plans/workflows/plan-generation.steps', () => ({
  persistPlanGenerationWorkflowMetadataStep: workflowMocks.persistMetadata,
  runPlanGenerationStep: workflowMocks.runGeneration,
}));

const reservation = makeAttemptReservation();
const input: PlanGenerationWorkflowInput = {
  planId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  userId: 'user-1',
  tier: 'free',
  input: {
    topic: 'Learn testing',
    skillLevel: 'beginner',
    weeklyHours: 5,
    learningStyle: 'mixed',
  },
  correlationId: 'corr-plan-gen',
  reservation: {
    attemptId: reservation.attemptId,
    attemptNumber: reservation.attemptNumber,
    startedAt: reservation.startedAt.toISOString(),
    promptHash: reservation.promptHash,
    sanitized: reservation.sanitized,
  },
};

describe('planGenerationWorkflow', () => {
  beforeEach(() => {
    workflowMocks.persistMetadata.mockReset();
    workflowMocks.runGeneration.mockReset();
    workflowMocks.persistMetadata.mockResolvedValue(undefined);
  });

  it('persists metadata then returns generation step result', async () => {
    const generationResult = {
      status: 'generation_success',
      data: { modules: [], durationMs: 1, metadata: {} },
    } satisfies GenerationAttemptResult;

    workflowMocks.runGeneration.mockResolvedValue(generationResult);

    const result = await planGenerationWorkflow(input);

    expect(workflowMocks.persistMetadata).toHaveBeenCalledWith(input);
    expect(workflowMocks.runGeneration).toHaveBeenCalledWith(input);
    expect(result).toEqual(generationResult);
  });
});
