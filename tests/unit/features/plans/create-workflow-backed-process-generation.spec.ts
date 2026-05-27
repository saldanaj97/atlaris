import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { ProcessGenerationInput } from '@/features/plans/lifecycle/types';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';

import { createWorkflowBackedProcessGeneration } from '@/features/plans/create-workflow-backed-process-generation';
import { planGenerationWorkflow } from '@/features/plans/workflows/plan-generation.workflow';
import { makeAttemptReservation } from '@tests/fixtures/attempts';
import { createId } from '@tests/fixtures/ids';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  reserveAttemptSlot: vi.fn(),
  workflowStart: vi.fn(),
  processGenerationAttempt: vi.fn(),
  finalizeFailure: vi.fn(),
};

const input: ProcessGenerationInput = {
  planId: createId('plan'),
  userId: createId('user'),
  tier: 'free',
  input: {
    topic: 'Topic',
    skillLevel: 'beginner',
    weeklyHours: 5,
    learningStyle: 'mixed',
  },
};

describe('createWorkflowBackedProcessGeneration', () => {
  const lifecycleService = {
    processGenerationAttempt: mocks.processGenerationAttempt,
  } as unknown as PlanLifecycleService;
  const dbClient = {} as AttemptsDbClient;

  beforeEach(() => {
    mocks.reserveAttemptSlot.mockReset();
    mocks.workflowStart.mockReset();
    mocks.processGenerationAttempt.mockReset();
    mocks.finalizeFailure.mockReset();
  });

  it('falls back to lifecycle processing when reservation is rejected', async () => {
    mocks.reserveAttemptSlot.mockResolvedValue({
      reserved: false,
      reason: 'capped',
    });
    mocks.processGenerationAttempt.mockResolvedValue({
      status: 'permanent_failure',
      classification: 'capped',
      error: new Error('capped'),
    });

    const run = createWorkflowBackedProcessGeneration(
      lifecycleService,
      dbClient,
      'corr-1',
      {
        reserveAttemptSlot: mocks.reserveAttemptSlot,
        workflowStart: mocks.workflowStart,
        workflowFn: planGenerationWorkflow,
      },
    );
    const result = await run(input);

    expect(mocks.processGenerationAttempt).toHaveBeenCalledWith(input);
    expect(mocks.workflowStart).not.toHaveBeenCalled();
    expect(result.status).toBe('permanent_failure');
  });

  it('starts workflow after reservation and returns run.returnValue', async () => {
    const reservation = makeAttemptReservation({ attemptId: 'att-99' });
    const onAttemptReserved = vi.fn();
    const workflowResult = {
      status: 'generation_success',
      data: { modules: [], durationMs: 1, metadata: {} },
    };

    mocks.reserveAttemptSlot.mockResolvedValue(reservation);
    mocks.workflowStart.mockResolvedValue({
      runId: 'wrun_plan',
      returnValue: Promise.resolve(workflowResult),
    });

    const run = createWorkflowBackedProcessGeneration(
      lifecycleService,
      dbClient,
      'corr-2',
      {
        reserveAttemptSlot: mocks.reserveAttemptSlot,
        workflowStart: mocks.workflowStart,
        workflowFn: planGenerationWorkflow,
      },
    );
    const result = await run({ ...input, onAttemptReserved });

    expect(onAttemptReserved).toHaveBeenCalledWith(reservation);
    expect(mocks.workflowStart).toHaveBeenCalledWith(
      planGenerationWorkflow,
      expect.any(Array),
    );
    expect(result).toEqual(workflowResult);
  });

  it('finalizes failure when workflow start throws', async () => {
    const reservation = makeAttemptReservation({ attemptId: 'att-fail' });
    const startError = new Error('workflow unavailable');

    mocks.reserveAttemptSlot.mockResolvedValue(reservation);
    mocks.workflowStart.mockRejectedValue(startError);

    const run = createWorkflowBackedProcessGeneration(
      lifecycleService,
      dbClient,
      'corr-3',
      {
        reserveAttemptSlot: mocks.reserveAttemptSlot,
        workflowStart: mocks.workflowStart,
        workflowFn: planGenerationWorkflow,
        finalizeFailure: mocks.finalizeFailure,
      },
    );

    await expect(run(input)).rejects.toThrow('workflow unavailable');
    expect(mocks.finalizeFailure).toHaveBeenCalledWith(
      dbClient,
      expect.objectContaining({
        reservation,
        planId: input.planId,
        userId: input.userId,
        error: startError,
      }),
    );
  });
});
