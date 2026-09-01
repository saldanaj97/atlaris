import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { ProcessGenerationInput } from '@/features/plans/lifecycle/types';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';

import { createWorkflowBackedProcessGeneration } from '@/features/plans/create-workflow-backed-process-generation';
import { planGenerationWorkflow } from '@/features/plans/workflows/plan-generation.workflow';
import { makeAttemptReservation } from '@tests/fixtures/attempts';
import { createId } from '@tests/fixtures/ids';
import { createDeferredPromise } from '@tests/helpers/deferred-promise';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  reserveAttemptSlot: vi.fn(),
  workflowStart: vi.fn(),
  processGenerationAttempt: vi.fn(),
  settleReservationRejection: vi.fn(),
  settleReservedAttemptFailure: vi.fn(),
  finalizeFailure: vi.fn(),
};

const input: ProcessGenerationInput = {
  planId: createId('plan'),
  userId: createId('user'),
  tier: 'free',
  generationPurpose: 'initial',
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
    settleReservationRejection: mocks.settleReservationRejection,
    settleReservedAttemptFailure: mocks.settleReservedAttemptFailure,
  } as unknown as PlanLifecycleService;
  const dbClient = {} as AttemptsDbClient;

  beforeEach(() => {
    mocks.reserveAttemptSlot.mockReset();
    mocks.workflowStart.mockReset();
    mocks.processGenerationAttempt.mockReset();
    mocks.settleReservationRejection.mockReset();
    mocks.settleReservedAttemptFailure.mockReset();
    mocks.finalizeFailure.mockReset();
  });

  it('settles a reservation rejection without reserving again', async () => {
    const rejection = {
      reserved: false as const,
      reason: 'capped' as const,
    };
    const clock = vi.fn(() => 1_000);
    mocks.reserveAttemptSlot.mockResolvedValue(rejection);
    mocks.settleReservationRejection.mockResolvedValue({
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
        clock,
      },
    );
    const result = await run(input);

    expect(mocks.settleReservationRejection).toHaveBeenCalledWith(
      input,
      rejection,
      { startedAt: 1_000, clock },
    );
    expect(mocks.processGenerationAttempt).not.toHaveBeenCalled();
    expect(mocks.workflowStart).not.toHaveBeenCalled();
    expect(result.status).toBe('permanent_failure');
  });

  it('captures reservation-rejection start before reserveAttemptSlot and forwards clock', async () => {
    const events: string[] = [];
    const clock = vi.fn(() => {
      events.push('clock');
      return 5_000;
    });
    const rejection = {
      reserved: false as const,
      reason: 'capped' as const,
    };
    mocks.reserveAttemptSlot.mockImplementation(async () => {
      events.push('reserve');
      return rejection;
    });
    mocks.settleReservationRejection.mockImplementation(async () => {
      events.push('settle');
      return {
        status: 'permanent_failure',
        classification: 'capped',
        error: new Error('capped'),
      };
    });

    const run = createWorkflowBackedProcessGeneration(
      lifecycleService,
      dbClient,
      'corr-timing',
      {
        reserveAttemptSlot: mocks.reserveAttemptSlot,
        workflowStart: mocks.workflowStart,
        workflowFn: planGenerationWorkflow,
        clock,
      },
    );
    await run(input);

    expect(events).toEqual(['clock', 'reserve', 'settle']);
    expect(clock).toHaveBeenCalledTimes(1);
    expect(mocks.settleReservationRejection).toHaveBeenCalledWith(
      input,
      rejection,
      { startedAt: 5_000, clock },
    );
    expect(mocks.workflowStart).not.toHaveBeenCalled();
  });

  it('starts workflow after reservation and returns run.returnValue', async () => {
    const reservation = makeAttemptReservation({ attemptId: 'att-99' });
    const callbackStarted = createDeferredPromise<void>();
    const callbackGate = createDeferredPromise<void>();
    const onAttemptReserved = vi.fn(async () => {
      callbackStarted.resolve(undefined);
      await callbackGate.promise;
    });
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
    const resultPromise = run({ ...input, onAttemptReserved });

    await callbackStarted.promise;
    expect(mocks.workflowStart).not.toHaveBeenCalled();
    callbackGate.resolve(undefined);
    const result = await resultPromise;

    expect(onAttemptReserved).toHaveBeenCalledWith(reservation);
    expect(mocks.reserveAttemptSlot).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: input.planId,
        userId: input.userId,
        generationPurpose: 'initial',
      }),
    );
    expect(mocks.workflowStart).toHaveBeenCalledWith(planGenerationWorkflow, [
      expect.objectContaining({
        planId: input.planId,
        generationPurpose: 'initial',
        reservation: expect.objectContaining({
          attemptId: 'att-99',
          generationPurpose: 'initial',
        }),
      }),
    ]);
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
