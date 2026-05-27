import type { GenerationAttemptResult } from '@/features/plans/lifecycle/types';
import type { PlanGenerationWorkflowInput } from '@/features/plans/workflows/plan-generation.types';

import { createPlanGenerationWorkflow } from '@/features/plans/workflows/plan-generation.workflow';
import { makeAttemptReservation } from '@tests/fixtures/attempts';
import { createId } from '@tests/fixtures/ids';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const workflowMocks = {
  persistMetadata: vi.fn(),
  runGeneration: vi.fn(),
};

const reservation = makeAttemptReservation();
const input: PlanGenerationWorkflowInput = {
  planId: createId('plan'),
  userId: createId('user'),
  tier: 'free',
  input: {
    topic: 'Learn testing',
    skillLevel: 'beginner',
    weeklyHours: 5,
    learningStyle: 'mixed',
  },
  correlationId: createId('corr'),
  reservation: {
    attemptId: reservation.attemptId,
    attemptNumber: reservation.attemptNumber,
    startedAt: reservation.startedAt.toISOString(),
    promptHash: reservation.promptHash,
    sanitized: reservation.sanitized,
  },
};
const workflow = createPlanGenerationWorkflow(workflowMocks);

describe('planGenerationWorkflow', () => {
  beforeEach(() => {
    workflowMocks.persistMetadata.mockReset();
    workflowMocks.runGeneration.mockReset();
    workflowMocks.persistMetadata.mockResolvedValue(undefined);
  });

  it('returns generation step result', async () => {
    const generationResult = {
      status: 'generation_success',
      data: { modules: [], durationMs: 1, metadata: {} },
    } satisfies GenerationAttemptResult;

    workflowMocks.runGeneration.mockResolvedValue(generationResult);

    const result = await workflow(input);

    expect(result).toEqual(generationResult);
  });
});
