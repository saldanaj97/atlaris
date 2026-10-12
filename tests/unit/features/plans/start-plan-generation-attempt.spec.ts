import type { PlanGenerationDispatchResult } from '@/features/jobs/plan-generation-dispatch';
import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { ProcessGenerationInput } from '@/features/plans/lifecycle/types';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';

import {
  startPlanGenerationAttempt,
  type StartPlanGenerationAttemptDeps,
} from '@/features/plans/start-plan-generation-attempt';
import { planGenerationWorkflow } from '@/features/plans/workflows/plan-generation.workflow';
import { planGenerationStartCommandSchema } from '@/lib/jobs-worker/contract';
import { makeAttemptReservation } from '@tests/fixtures/attempts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PLAN_ID = '0b5e2c1d-6f4a-4e3b-9c8d-7a6b5c4d3e2f';
const USER_ID = '2d7a4e3f-8b6c-4a5d-9e0f-9c8d7e6f5a41';
const ATTEMPT_ID = '5a0d7b6c-1e9f-4d8a-8b3c-2f1a0b9c8d74';

const input: ProcessGenerationInput = {
  planId: PLAN_ID,
  userId: USER_ID,
  tier: 'pro',
  generationPurpose: 'initial',
  allowedGenerationStatuses: ['failed', 'pending_retry'],
  input: {
    topic: 'TypeScript',
    skillLevel: 'beginner',
    weeklyHours: 5,
    learningStyle: 'mixed',
  },
  modelOverride: 'openai/gpt-4o-mini',
};

const reservation = makeAttemptReservation({ attemptId: ATTEMPT_ID });
const dbClient = {} as AttemptsDbClient;

const mocks = {
  reserveAttemptSlot: vi.fn(),
  workflowStart: vi.fn(),
  dispatch:
    vi.fn<(...args: unknown[]) => Promise<PlanGenerationDispatchResult>>(),
  finalizeFailure: vi.fn(),
  settleReservationRejection: vi.fn(),
};

const lifecycleService = {
  settleReservationRejection: mocks.settleReservationRejection,
} as unknown as PlanLifecycleService;

function deps(): StartPlanGenerationAttemptDeps {
  return {
    reserveAttemptSlot: mocks.reserveAttemptSlot,
    workflowStart: mocks.workflowStart,
    workflowFn: planGenerationWorkflow,
    dispatch: mocks.dispatch,
    finalizeFailure: mocks.finalizeFailure,
    clock: () => 1_000,
  };
}

function startOn(runtime: 'vercel' | 'cloudflare') {
  return startPlanGenerationAttempt(
    { lifecycleService, dbClient, correlationId: 'req-1', runtime, input },
    deps(),
  );
}

/** A Workflow SDK run whose `returnValue` records any read. */
function runWithWatchedReturnValue() {
  const read = vi.fn();
  return {
    run: {
      runId: 'wrun_plan',
      get returnValue() {
        read();
        return new Promise(() => {});
      },
    },
    read,
  };
}

const expectedWorkflowInput = {
  planId: PLAN_ID,
  userId: USER_ID,
  tier: 'pro',
  input: input.input,
  generationPurpose: 'initial',
  modelOverride: 'openai/gpt-4o-mini',
  correlationId: 'req-1',
  reservation: expect.objectContaining({ attemptId: ATTEMPT_ID }),
  allowedGenerationStatuses: ['failed', 'pending_retry'],
  requiredGenerationStatus: undefined,
};

describe('startPlanGenerationAttempt', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.reserveAttemptSlot.mockResolvedValue(reservation);
  });

  it('reserves with the retry status guard before starting', async () => {
    const { run } = runWithWatchedReturnValue();
    mocks.workflowStart.mockResolvedValue(run);

    await startOn('vercel');

    expect(mocks.reserveAttemptSlot).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: PLAN_ID,
        userId: USER_ID,
        generationPurpose: 'initial',
        allowedGenerationStatuses: ['failed', 'pending_retry'],
        dbClient,
      }),
    );
  });

  it.each(['vercel', 'cloudflare'] as const)(
    'settles a reservation rejection on %s without starting anything',
    async (runtime) => {
      const rejection = {
        reserved: false as const,
        reason: 'in_progress' as const,
      };
      mocks.reserveAttemptSlot.mockResolvedValue(rejection);
      mocks.settleReservationRejection.mockResolvedValue({
        status: 'retryable_failure',
        classification: 'rate_limit',
        error: new Error('in progress'),
      });

      const result = await startOn(runtime);

      expect(result).toEqual({
        kind: 'not_started',
        classification: 'rate_limit',
      });
      expect(mocks.settleReservationRejection).toHaveBeenCalledWith(
        input,
        rejection,
        { startedAt: 1_000, clock: expect.any(Function) },
      );
      expect(mocks.workflowStart).not.toHaveBeenCalled();
      expect(mocks.dispatch).not.toHaveBeenCalled();
      expect(mocks.finalizeFailure).not.toHaveBeenCalled();
    },
  );

  describe('PLAN_GENERATION_RUNTIME=vercel', () => {
    it('starts the Vercel workflow and returns without reading run.returnValue', async () => {
      const { run, read } = runWithWatchedReturnValue();
      mocks.workflowStart.mockResolvedValue(run);

      const result = await startOn('vercel');

      expect(result).toEqual({ kind: 'started', attemptId: ATTEMPT_ID });
      expect(mocks.workflowStart).toHaveBeenCalledWith(planGenerationWorkflow, [
        expectedWorkflowInput,
      ]);
      expect(read).not.toHaveBeenCalled();
      expect(mocks.dispatch).not.toHaveBeenCalled();
      expect(mocks.finalizeFailure).not.toHaveBeenCalled();
    });

    it('settles the reserved attempt as a retryable failure when start throws', async () => {
      const startError = new Error('workflow unavailable');
      mocks.workflowStart.mockRejectedValue(startError);

      const result = await startOn('vercel');

      expect(result).toEqual({
        kind: 'not_started',
        classification: 'provider_error',
      });
      expect(mocks.finalizeFailure).toHaveBeenCalledWith(dbClient, {
        reservation,
        planId: PLAN_ID,
        userId: USER_ID,
        error: startError,
      });
    });
  });

  describe('PLAN_GENERATION_RUNTIME=cloudflare', () => {
    it.each([
      [{ kind: 'accepted', instanceId: `plan-${ATTEMPT_ID}` }],
      [{ kind: 'duplicate' }],
    ] satisfies [PlanGenerationDispatchResult][])(
      'returns started for %j',
      async (dispatched) => {
        mocks.dispatch.mockResolvedValue(dispatched);

        const result = await startOn('cloudflare');

        expect(result).toEqual({ kind: 'started', attemptId: ATTEMPT_ID });
        expect(mocks.dispatch).toHaveBeenCalledWith(expectedWorkflowInput);
        expect(mocks.workflowStart).not.toHaveBeenCalled();
        expect(mocks.finalizeFailure).not.toHaveBeenCalled();
      },
    );

    it('dispatches a body the Worker contract accepts', async () => {
      mocks.dispatch.mockResolvedValue({ kind: 'duplicate' });

      await startOn('cloudflare');

      const sent = mocks.dispatch.mock.calls[0]?.[0];
      const wire = JSON.parse(JSON.stringify({ v: 1, ...(sent as object) }));
      expect(planGenerationStartCommandSchema.safeParse(wire).success).toBe(
        true,
      );
    });

    it.each([
      [{ kind: 'disabled', code: 'jobs_paused' }, /jobs_paused/],
      [{ kind: 'disabled', code: 'job_disabled' }, /job_disabled/],
      [{ kind: 'failed' }, /did not start/],
    ] satisfies [PlanGenerationDispatchResult, RegExp][])(
      'settles the reserved attempt as a retryable failure for %j',
      async (dispatched, message) => {
        mocks.dispatch.mockResolvedValue(dispatched);

        const result = await startOn('cloudflare');

        expect(result).toEqual({
          kind: 'not_started',
          classification: 'provider_error',
        });
        expect(mocks.finalizeFailure).toHaveBeenCalledWith(dbClient, {
          reservation,
          planId: PLAN_ID,
          userId: USER_ID,
          error: expect.objectContaining({
            message: expect.stringMatching(message),
          }),
        });
        expect(mocks.workflowStart).not.toHaveBeenCalled();
      },
    );
  });

  it('settles through the lifecycle service by default', async () => {
    const settleReservedAttemptFailure = vi.fn();
    mocks.workflowStart.mockRejectedValue(new Error('down'));

    await startPlanGenerationAttempt(
      {
        lifecycleService: {
          settleReservedAttemptFailure,
        } as unknown as PlanLifecycleService,
        dbClient,
        correlationId: 'req-1',
        runtime: 'vercel',
        input,
      },
      { ...deps(), finalizeFailure: undefined },
    );

    expect(settleReservedAttemptFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reservation,
        planId: PLAN_ID,
        userId: USER_ID,
        classification: 'provider_error',
        retryable: true,
        generationPurpose: reservation.generationPurpose,
      }),
    );
  });
});
