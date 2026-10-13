import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type {
  CreatePlanResult,
  ProcessGenerationInput,
} from '@/features/plans/lifecycle/types';
import type { StartPlanGenerationAttemptDeps } from '@/features/plans/start-plan-generation-attempt';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';

import { getPersistableModelsForTier } from '@/features/ai/model-preferences';
import {
  createPlanGenerationSessionBoundary,
  PLAN_RETRY_RESERVATION_ALLOWED_STATUSES,
} from '@/features/plans/session/plan-generation-session';
import { AppError } from '@/lib/api/errors';
import { makeAttemptReservation } from '@tests/fixtures/attempts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { safeMarkPlanFailedWithDbClient, resolveUserTier } = vi.hoisted(() => ({
  safeMarkPlanFailedWithDbClient: vi.fn(),
  resolveUserTier: vi.fn(),
}));

vi.mock('@/features/billing/tier', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/billing/tier')>()),
  resolveUserTier,
}));

vi.mock('@/features/plans/session/stream-cleanup', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/plans/session/stream-cleanup')
  >()),
  safeMarkPlanFailedWithDbClient,
}));

const PLAN_ID = '0b5e2c1d-6f4a-4e3b-9c8d-7a6b5c4d3e2f';
const ATTEMPT_ID = '5a0d7b6c-1e9f-4d8a-8b3c-2f1a0b9c8d74';

const STARTER_OUTLINE_MODELS = getPersistableModelsForTier(
  'starter',
  'initial_outline',
);
const STARTER_SAVED_MODEL = STARTER_OUTLINE_MODELS[0]?.id;
const STARTER_QUERY_MODEL = STARTER_OUTLINE_MODELS[1]?.id;
const PRO_QUERY_MODEL = getPersistableModelsForTier(
  'pro',
  'initial_outline',
).find(
  ({ id }) => !STARTER_OUTLINE_MODELS.some((model) => model.id === id),
)?.id;

if (!STARTER_SAVED_MODEL || !STARTER_QUERY_MODEL || !PRO_QUERY_MODEL) {
  throw new Error('Expected outline model fixtures for model override tests');
}

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
  dispatch: vi.fn(),
  finalizeFailure: vi.fn(),
};

function buildBoundary() {
  const lifecycleService = {
    createPlan: mocks.createPlan,
    settleReservationRejection: mocks.settleReservationRejection,
  } as unknown as PlanLifecycleService;
  const startDeps: StartPlanGenerationAttemptDeps = {
    reserveAttemptSlot: mocks.reserveAttemptSlot,
    dispatch: mocks.dispatch,
    finalizeFailure: mocks.finalizeFailure,
  };
  return createPlanGenerationSessionBoundary({
    createLifecycleService: () => lifecycleService,
    startDeps,
  });
}

function startCreate(
  boundary: ReturnType<typeof buildBoundary>,
  url = 'http://localhost/api/v1/plans',
  savedPreferredAiModel: string | null = null,
) {
  return boundary.startCreate({
    req: new Request(url, { method: 'POST' }),
    authUserId: 'auth-user',
    internalUserId: 'internal-user',
    body,
    savedPreferredAiModel,
    requestId: 'req-1',
  });
}

function startRetry(
  boundary: ReturnType<typeof buildBoundary>,
  url: string,
  savedPreferredAiModel: string | null,
) {
  return boundary.startRetry({
    req: new Request(url, { method: 'POST' }),
    authUserId: 'auth-user',
    internalUserId: 'internal-user',
    planId: PLAN_ID,
    plan: {
      topic: 'TypeScript',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      startDate: null,
      deadlineDate: '2030-01-01',
    },
    savedPreferredAiModel,
    tierDb: {} as never,
    requestId: 'req-1',
  });
}

/** The `modelOverride` the Worker dispatch received. */
function startedModelOverride(): string | null {
  const [workflowInput] = mocks.dispatch.mock.calls[0] as [
    { modelOverride: string | null },
  ];
  return workflowInput.modelOverride;
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
    mocks.dispatch.mockResolvedValue({
      kind: 'accepted',
      instanceId: 'plan-1',
    });
  });

  it('creates the plan, starts its first attempt, and returns both IDs', async () => {
    const started = await startCreate(buildBoundary());

    expect(started).toEqual({ planId: PLAN_ID, attemptId: ATTEMPT_ID });
    expect(mocks.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'internal-user', topic: 'TypeScript' }),
    );
    const [workflowInput] = mocks.dispatch.mock.calls[0] as [
      { correlationId: string; input: ProcessGenerationInput['input'] },
    ];
    expect(workflowInput.correlationId).toBe('req-1');
    expect(workflowInput.input).toMatchObject({ topic: 'TypeScript' });
  });

  it('keeps plan-creation rejections as today (no reservation)', async () => {
    mocks.createPlan.mockResolvedValue({
      status: 'duplicate_detected',
      existingPlanId: 'existing-plan',
    });

    const error = await expectAppError(startCreate(buildBoundary()));

    expect(error.status()).toBe(409);
    expect(error.code()).toBe('DUPLICATE_PLAN');
    expect(mocks.reserveAttemptSlot).not.toHaveBeenCalled();
  });

  it('maps a settled reservation rejection to the failure presentation with the plan ID', async () => {
    mocks.reserveAttemptSlot.mockResolvedValue({
      reserved: false,
      reason: 'in_progress',
    });
    mocks.settleReservationRejection.mockResolvedValue({
      status: 'retryable_failure',
      classification: 'rate_limit',
      error: new Error('in progress'),
    });

    const error = await expectAppError(startCreate(buildBoundary()));

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

    const error = await expectAppError(startCreate(buildBoundary()));

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

    const error = await expectAppError(startCreate(buildBoundary()));

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

  it('forwards a valid ?model= override to the started attempt', async () => {
    await startCreate(
      buildBoundary(),
      `http://localhost/api/v1/plans?model=${encodeURIComponent(PRO_QUERY_MODEL)}`,
      STARTER_SAVED_MODEL,
    );

    expect(startedModelOverride()).toBe(PRO_QUERY_MODEL);
  });

  it('ignores an invalid ?model= override and falls back to the saved preference', async () => {
    await startCreate(
      buildBoundary(),
      'http://localhost/api/v1/plans?model=invalid/model-id',
      PRO_QUERY_MODEL,
    );

    expect(startedModelOverride()).toBe(PRO_QUERY_MODEL);
  });
});

describe('PlanGenerationSessionBoundary.startRetry', () => {
  const retryUrl = `http://localhost/api/v1/plans/${PLAN_ID}/retry`;

  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    resolveUserTier.mockReset();
    resolveUserTier.mockResolvedValue('starter');
    mocks.reserveAttemptSlot.mockResolvedValue(
      makeAttemptReservation({ attemptId: ATTEMPT_ID }),
    );
    mocks.dispatch.mockResolvedValue({
      kind: 'accepted',
      instanceId: 'plan-2',
    });
  });

  it('reserves with the retry status guard and forwards the saved preference', async () => {
    const started = await startRetry(
      buildBoundary(),
      retryUrl,
      STARTER_SAVED_MODEL,
    );

    expect(started).toEqual({ planId: PLAN_ID, attemptId: ATTEMPT_ID });
    expect(resolveUserTier).toHaveBeenCalledWith('internal-user', {});
    expect(mocks.reserveAttemptSlot).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: PLAN_ID,
        userId: 'internal-user',
        generationPurpose: 'initial',
        allowedGenerationStatuses: PLAN_RETRY_RESERVATION_ALLOWED_STATUSES,
      }),
    );
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(startedModelOverride()).toBe(STARTER_SAVED_MODEL);
  });

  it('prefers a valid ?model= override over the saved preference', async () => {
    await startRetry(
      buildBoundary(),
      `${retryUrl}?model=${encodeURIComponent(STARTER_QUERY_MODEL)}`,
      STARTER_SAVED_MODEL,
    );

    expect(startedModelOverride()).toBe(STARTER_QUERY_MODEL);
  });
});
