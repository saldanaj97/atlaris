import type { PlanGenerationDispatchResult } from '@/features/jobs/plan-generation-dispatch';
import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { ProcessGenerationInput } from '@/features/plans/lifecycle/types';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';

import {
  startPlanGenerationAttempt,
  type StartPlanGenerationAttemptDeps,
} from '@/features/plans/start-plan-generation-attempt';
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
    dispatch: mocks.dispatch,
    finalizeFailure: mocks.finalizeFailure,
    clock: () => 1_000,
  };
}

function start() {
  return startPlanGenerationAttempt(
    { lifecycleService, dbClient, correlationId: 'req-1', input },
    deps(),
  );
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
    mocks.dispatch.mockResolvedValue({ kind: 'duplicate' });

    await start();

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

  it('settles a reservation rejection without starting anything', async () => {
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

    const result = await start();

    expect(result).toEqual({
      kind: 'not_started',
      classification: 'rate_limit',
    });
    expect(mocks.settleReservationRejection).toHaveBeenCalledWith(
      input,
      rejection,
      { startedAt: 1_000, clock: expect.any(Function) },
    );
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.finalizeFailure).not.toHaveBeenCalled();
  });

  describe('jobs Worker hand-off', () => {
    it.each([
      [{ kind: 'accepted', instanceId: `plan-${ATTEMPT_ID}` }],
      [{ kind: 'duplicate' }],
    ] satisfies [PlanGenerationDispatchResult][])(
      'returns started for %j',
      async (dispatched) => {
        mocks.dispatch.mockResolvedValue(dispatched);

        const result = await start();

        expect(result).toEqual({ kind: 'started', attemptId: ATTEMPT_ID });
        expect(mocks.dispatch).toHaveBeenCalledWith(expectedWorkflowInput);
        expect(mocks.finalizeFailure).not.toHaveBeenCalled();
      },
    );

    it('dispatches a body the Worker contract accepts', async () => {
      mocks.dispatch.mockResolvedValue({ kind: 'duplicate' });

      await start();

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

        const result = await start();

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
      },
    );
  });

  it('settles through the lifecycle service by default', async () => {
    const settleReservedAttemptFailure = vi.fn();
    mocks.dispatch.mockResolvedValue({ kind: 'failed' });

    await startPlanGenerationAttempt(
      {
        lifecycleService: {
          settleReservedAttemptFailure,
        } as unknown as PlanLifecycleService,
        dbClient,
        correlationId: 'req-1',
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
