import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type {
  CreatePlanResult,
  ProcessGenerationInput,
} from '@/features/plans/lifecycle/types';
import type { StartPlanGenerationAttemptDeps } from '@/features/plans/start-plan-generation-attempt';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';

import { createPlanGenerationSessionBoundary } from '@/features/plans/session/plan-generation-session';
import { planGenerationWorkflow } from '@/features/plans/workflows/plan-generation.workflow';
import { AppError } from '@/lib/api/errors';
import { EnvValidationError } from '@/lib/config/env/shared';
import { makeAttemptReservation } from '@tests/fixtures/attempts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { safeMarkPlanFailedWithDbClient } = vi.hoisted(() => ({
  safeMarkPlanFailedWithDbClient: vi.fn(),
}));

vi.mock('@/features/plans/session/stream-cleanup', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/plans/session/stream-cleanup')
  >()),
  safeMarkPlanFailedWithDbClient,
}));

const PLAN_ID = '0b5e2c1d-6f4a-4e3b-9c8d-7a6b5c4d3e2f';
const ATTEMPT_ID = '5a0d7b6c-1e9f-4d8a-8b3c-2f1a0b9c8d74';

const body: CreateLearningPlanInput = {
  topic: 'TypeScript',
  skillLevel: 'beginner',
  weeklyHours: 5,
  learningStyle: 'mixed',
  notes: undefined,
  startDate: undefined,
  deadlineDate: '2030-01-01',
  visibility: 'private',
  origin: 'ai',
};

const createResult: CreatePlanResult = {
  status: 'success',
  planId: PLAN_ID,
  tier: 'pro',
  normalizedInput: {
    topic: 'TypeScript',
    skillLevel: 'beginner',
    weeklyHours: 5,
    learningStyle: 'mixed',
    startDate: null,
    deadlineDate: '2030-01-01',
  },
};

const mocks = {
  createPlan: vi.fn(),
  settleReservationRejection: vi.fn(),
  reserveAttemptSlot: vi.fn(),
  workflowStart: vi.fn(),
  dispatch: vi.fn(),
  finalizeFailure: vi.fn(),
};

function buildBoundary(runtime: () => 'vercel' | 'cloudflare') {
  const lifecycleService = {
    createPlan: mocks.createPlan,
    settleReservationRejection: mocks.settleReservationRejection,
  } as unknown as PlanLifecycleService;
  const startDeps: StartPlanGenerationAttemptDeps = {
    reserveAttemptSlot: mocks.reserveAttemptSlot,
    workflowStart: mocks.workflowStart,
    workflowFn: planGenerationWorkflow,
    dispatch: mocks.dispatch,
    finalizeFailure: mocks.finalizeFailure,
  };
  return createPlanGenerationSessionBoundary({
    createLifecycleService: () => lifecycleService,
    runtime,
    startDeps,
  });
}

function startCreate(
  boundary: ReturnType<typeof buildBoundary>,
  url = 'http://localhost/api/v1/plans',
) {
  return boundary.startCreate({
    req: new Request(url, { method: 'POST' }),
    authUserId: 'auth-user',
    internalUserId: 'internal-user',
    body,
    savedPreferredAiModel: null,
    requestId: 'req-1',
  });
}

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => {
      throw new Error('expected startCreate to throw');
    },
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe('PlanGenerationSessionBoundary.startCreate', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    safeMarkPlanFailedWithDbClient.mockReset();
    mocks.createPlan.mockResolvedValue(createResult);
    mocks.reserveAttemptSlot.mockResolvedValue(
      makeAttemptReservation({ attemptId: ATTEMPT_ID }),
    );
    mocks.workflowStart.mockResolvedValue({ runId: 'wrun_plan' });
  });

  it('creates the plan, starts its first attempt, and returns both IDs', async () => {
    const started = await startCreate(buildBoundary(() => 'vercel'));

    expect(started).toEqual({ planId: PLAN_ID, attemptId: ATTEMPT_ID });
    expect(mocks.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'internal-user', topic: 'TypeScript' }),
    );
    const [, [workflowInput]] = mocks.workflowStart.mock.calls[0] as [
      unknown,
      [{ correlationId: string; input: ProcessGenerationInput['input'] }],
    ];
    expect(workflowInput.correlationId).toBe('req-1');
    expect(workflowInput.input).toMatchObject({ topic: 'TypeScript' });
  });

  it('reads PLAN_GENERATION_RUNTIME before creating a plan', async () => {
    const boundary = buildBoundary(() => {
      throw new EnvValidationError(
        'PLAN_GENERATION_RUNTIME must be one of: vercel, cloudflare',
        'PLAN_GENERATION_RUNTIME',
      );
    });

    await expect(startCreate(boundary)).rejects.toBeInstanceOf(
      EnvValidationError,
    );
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(mocks.reserveAttemptSlot).not.toHaveBeenCalled();
  });

  it('keeps plan-creation rejections as today (no reservation)', async () => {
    mocks.createPlan.mockResolvedValue({
      status: 'duplicate_detected',
      existingPlanId: 'existing-plan',
    });

    const error = await expectAppError(
      startCreate(buildBoundary(() => 'vercel')),
    );

    expect(error.status()).toBe(409);
    expect(error.code()).toBe('DUPLICATE_PLAN');
    expect(mocks.reserveAttemptSlot).not.toHaveBeenCalled();
  });

  it('maps a settled reservation rejection to the SSE error presentation with the plan ID', async () => {
    mocks.reserveAttemptSlot.mockResolvedValue({
      reserved: false,
      reason: 'in_progress',
    });
    mocks.settleReservationRejection.mockResolvedValue({
      status: 'retryable_failure',
      classification: 'rate_limit',
      error: new Error('in progress'),
    });

    const error = await expectAppError(
      startCreate(buildBoundary(() => 'cloudflare')),
    );

    expect(error.status()).toBe(429);
    expect(error.code()).toBe('RATE_LIMITED');
    expect(error.message).toBe(
      'Too many requests. Please wait a moment and try again.',
    );
    expect(error.classification()).toBe('rate_limit');
    expect(error.details()).toEqual({ planId: PLAN_ID, retryable: true });
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('returns a retryable provider error with the plan ID when the Worker refuses', async () => {
    mocks.dispatch.mockResolvedValue({ kind: 'disabled', code: 'jobs_paused' });

    const error = await expectAppError(
      startCreate(buildBoundary(() => 'cloudflare')),
    );

    expect(mocks.finalizeFailure).toHaveBeenCalledTimes(1);
    expect(error.status()).toBe(503);
    expect(error.code()).toBe('GENERATION_FAILED');
    expect(error.message).toBe(
      'Plan generation encountered an error. Please try again.',
    );
    expect(error.classification()).toBe('provider_error');
    expect(error.details()).toEqual({ planId: PLAN_ID, retryable: true });
  });

  it('marks the plan failed and returns the fallback error when the start throws', async () => {
    const boom = new Error('reservation transaction failed');
    mocks.reserveAttemptSlot.mockRejectedValue(boom);

    const error = await expectAppError(
      startCreate(buildBoundary(() => 'vercel')),
    );

    expect(safeMarkPlanFailedWithDbClient).toHaveBeenCalledWith(
      PLAN_ID,
      'internal-user',
      expect.anything(),
    );
    expect(error.status()).toBe(503);
    expect(error.code()).toBe('GENERATION_FAILED');
    expect(error.details()).toEqual({ planId: PLAN_ID, retryable: true });
    expect(error.cause).toBe(boom);
  });
});
