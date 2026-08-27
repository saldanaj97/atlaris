import type { Job } from '@/features/jobs/types';
import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { RegenerationPlanRow } from '@/features/plans/regeneration-orchestration/process-workflow-support';
import type {
  PlanRegenerationAttemptPreparation,
  PlanRegenerationWorkflowInput,
} from '@/features/plans/workflows/plan-regeneration.types';
import type { AttemptReservation } from '@/lib/db/queries/types/attempts.types';

import { toSerializableReservation } from '@/features/plans/workflows/plan-generation.types';
import {
  claimPlanRegenerationJobStep,
  processPlanRegenerationStep,
  reservePlanRegenerationAttemptStep,
} from '@/features/plans/workflows/plan-regeneration.steps';
import { makeAttemptReservation } from '@tests/fixtures/attempts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claimJob: vi.fn(),
  loadJob: vi.fn(),
  updateJobPayload: vi.fn(),
  updateJobPayloadIfRunIdMissing: vi.fn(),
  failJob: vi.fn(),
  getWorkflowMetadata: vi.fn(),
  createPlanLifecycleService: vi.fn(),
  commitPlanGenerationFailure: vi.fn(),
  resolveUserTier: vi.fn(),
  getUserPreferences: vi.fn(),
  loadAuthorizedRegenerationPlan: vi.fn(),
  reserveRegenerationQuotaAtProviderStart: vi.fn(),
  findAttemptWithWorkflowIdempotencyKey: vi.fn(),
  reserveAttemptSlot: vi.fn(),
}));

vi.mock('@/features/jobs/queue', () => ({
  claimRegenerationJob: mocks.claimJob,
  loadJobById: mocks.loadJob,
  updateJobPayload: mocks.updateJobPayload,
  updateJobPayloadIfRunIdMissing: mocks.updateJobPayloadIfRunIdMissing,
  failJob: mocks.failJob,
}));

vi.mock('@/features/billing/regeneration-quota-boundary', () => ({
  reserveRegenerationQuotaAtProviderStart:
    mocks.reserveRegenerationQuotaAtProviderStart,
}));

vi.mock('@/features/plans/lifecycle/factory', () => ({
  createPlanLifecycleService: mocks.createPlanLifecycleService,
}));

vi.mock('@/features/plans/lifecycle/generation-finalization/store', () => ({
  commitPlanGenerationFailure: mocks.commitPlanGenerationFailure,
}));

vi.mock('@/lib/db/queries/attempts', () => ({
  findAttemptWithWorkflowIdempotencyKey:
    mocks.findAttemptWithWorkflowIdempotencyKey,
  reserveAttemptSlot: mocks.reserveAttemptSlot,
}));

vi.mock('@/features/billing/tier', () => ({
  resolveUserTier: mocks.resolveUserTier,
}));

vi.mock('@/lib/db/queries/user-preferences', () => ({
  getUserPreferences: mocks.getUserPreferences,
}));

vi.mock('@/features/plans/regeneration-orchestration/deps', () => ({
  createDefaultRegenerationOrchestrationDeps: vi.fn(() => ({})),
}));

vi.mock('@/features/billing/tier', () => ({
  resolveUserTier: mocks.resolveUserTier,
}));

vi.mock('@/lib/db/queries/user-preferences', () => ({
  getUserPreferences: mocks.getUserPreferences,
}));

vi.mock(
  '@/features/plans/regeneration-orchestration/process-workflow-support',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/features/plans/regeneration-orchestration/process-workflow-support')
      >();
    return {
      ...actual,
      loadAuthorizedRegenerationPlan: mocks.loadAuthorizedRegenerationPlan,
    };
  },
);

vi.mock('workflow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('workflow')>();
  return {
    ...actual,
    getWorkflowMetadata: mocks.getWorkflowMetadata,
  };
});

const input: PlanRegenerationWorkflowInput = {
  jobId: 'e6e5528d-1871-45d2-a055-7bc03f2ca8f8',
  planId: '0c834f38-e9e1-4c7d-bdc0-2e28c505256a',
  userId: '353d54b9-f3d0-4aa6-8c74-33956019cb71',
  correlationId: 'regen-same-run-race',
};

function job(status: Job['status'], runId?: string): Job {
  const now = new Date('2026-06-22T18:00:00.000Z');
  return {
    id: input.jobId,
    type: 'plan_regeneration',
    planId: input.planId,
    userId: input.userId,
    status,
    priority: 0,
    attempts: 0,
    maxAttempts: 3,
    data: {
      planId: input.planId,
      ...(runId
        ? {
            workflow: {
              provider: 'workflow-sdk' as const,
              runId,
              startedAt: now.toISOString(),
            },
          }
        : {}),
    },
    result: null,
    error: null,
    processingStartedAt: status === 'processing' ? now : null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('claimPlanRegenerationJobStep', () => {
  beforeEach(() => {
    mocks.claimJob.mockReset();
    mocks.loadJob.mockReset();
    mocks.updateJobPayload.mockReset();
    mocks.updateJobPayloadIfRunIdMissing.mockReset();
    mocks.getWorkflowMetadata.mockReturnValue({ workflowRunId: 'wrun_same' });
  });

  it('adopts a processing job without workflow metadata', async () => {
    mocks.loadJob.mockResolvedValue(job('processing'));
    mocks.updateJobPayloadIfRunIdMissing.mockResolvedValue(
      job('processing', 'wrun_same'),
    );

    await expect(claimPlanRegenerationJobStep(input)).resolves.toEqual({
      kind: 'claimed',
      runId: 'wrun_same',
    });

    expect(mocks.updateJobPayloadIfRunIdMissing).toHaveBeenCalledWith(
      input.jobId,
      expect.objectContaining({
        workflow: expect.objectContaining({
          provider: 'workflow-sdk',
          runId: 'wrun_same',
        }),
      }),
    );
    expect(mocks.claimJob).not.toHaveBeenCalled();
  });

  it('does not claim when a rival run already adopted the job', async () => {
    mocks.loadJob.mockResolvedValue(job('processing'));
    mocks.updateJobPayloadIfRunIdMissing.mockResolvedValue(
      job('processing', 'wrun_rival'),
    );

    await expect(claimPlanRegenerationJobStep(input)).resolves.toEqual({
      kind: 'in-flight',
      jobId: input.jobId,
      runId: 'wrun_rival',
    });

    expect(mocks.claimJob).not.toHaveBeenCalled();
  });

  it('does not claim when adoption finds the job already completed', async () => {
    mocks.loadJob.mockResolvedValue(job('processing'));
    mocks.updateJobPayloadIfRunIdMissing.mockResolvedValue(job('completed'));

    await expect(claimPlanRegenerationJobStep(input)).resolves.toEqual({
      kind: 'already-completed',
      jobId: input.jobId,
    });

    expect(mocks.claimJob).not.toHaveBeenCalled();
  });

  it('does not claim when adoption no longer finds the job', async () => {
    mocks.loadJob.mockResolvedValue(job('processing'));
    mocks.updateJobPayloadIfRunIdMissing.mockResolvedValue(null);

    await expect(claimPlanRegenerationJobStep(input)).resolves.toEqual({
      kind: 'job-not-found',
      jobId: input.jobId,
    });

    expect(mocks.claimJob).not.toHaveBeenCalled();
  });

  it('continues when a concurrent same-run claim wins the CAS', async () => {
    mocks.loadJob
      .mockResolvedValueOnce(job('pending'))
      .mockResolvedValueOnce(job('processing', 'wrun_same'));
    mocks.claimJob.mockResolvedValue(null);

    await expect(claimPlanRegenerationJobStep(input)).resolves.toEqual({
      kind: 'claimed',
      runId: 'wrun_same',
    });
  });
});

describe('processPlanRegenerationStep model resolution', () => {
  const processGenerationAttemptWithReservation = vi.fn();
  const serializedReservation = toSerializableReservation(
    makeAttemptReservation({ generationPurpose: 'regeneration' }),
  );
  const preparation: PlanRegenerationAttemptPreparation = {
    reservation: serializedReservation,
    tier: 'pro',
    generationInput: {
      topic: 'rust',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
    },
  };
  const savedSlots = {
    preferredAiModel: 'openai/gpt-5.2',
    preferredRegenerationAiModel: 'google/gemini-3-pro-preview',
    preferredLessonAiModel: 'google/gemini-3-flash-preview',
    analyticsTimezone: 'UTC',
  };
  const plan = {
    id: input.planId,
    userId: input.userId,
    topic: 'rust',
    skillLevel: 'beginner',
    weeklyHours: 5,
    learningStyle: 'mixed',
    startDate: null,
    deadlineDate: null,
  } as unknown as RegenerationPlanRow;

  beforeEach(() => {
    processGenerationAttemptWithReservation.mockReset();
    processGenerationAttemptWithReservation.mockResolvedValue({
      status: 'generation_success',
      data: { modules: [], metadata: {}, durationMs: 1 },
    });
    mocks.loadJob.mockReset();
    mocks.getWorkflowMetadata.mockReturnValue({ workflowRunId: 'wrun_same' });
    mocks.resolveUserTier.mockReset();
    mocks.getUserPreferences.mockReset();
    mocks.loadAuthorizedRegenerationPlan.mockReset();
    mocks.createPlanLifecycleService.mockReset();
    mocks.createPlanLifecycleService.mockReturnValue({
      processGenerationAttemptWithReservation,
    } as unknown as PlanLifecycleService);
    mocks.commitPlanGenerationFailure.mockReset();
    mocks.commitPlanGenerationFailure.mockResolvedValue(undefined);
    mocks.loadAuthorizedRegenerationPlan.mockResolvedValue(plan);
    mocks.getUserPreferences.mockResolvedValue(savedSlots);
    mocks.failJob.mockReset();
    mocks.failJob.mockResolvedValue(null);
    mocks.updateJobPayload.mockReset();
    mocks.updateJobPayload.mockImplementation(
      async (_jobId: string, payload: Job['data']) => ({
        ...job('processing', 'wrun_same'),
        data: payload,
      }),
    );
    mocks.reserveRegenerationQuotaAtProviderStart.mockReset();
    mocks.reserveRegenerationQuotaAtProviderStart.mockResolvedValue({
      ok: true,
      providerStartedAt: '2026-06-22T18:00:00.000Z',
      alreadySettled: false,
    });
    mocks.findAttemptWithWorkflowIdempotencyKey.mockReset();
    mocks.findAttemptWithWorkflowIdempotencyKey.mockResolvedValue(null);
    mocks.reserveAttemptSlot.mockReset();
    mocks.reserveAttemptSlot.mockResolvedValue(
      makeAttemptReservation({ generationPurpose: 'regeneration' }),
    );
  });

  it('returns a serialized reservation for durable workflow replay', async () => {
    const reservation = makeAttemptReservation({
      attemptId: 'regen-reservation',
      generationPurpose: 'regeneration',
    });
    mocks.reserveAttemptSlot.mockResolvedValue(reservation);
    mocks.loadJob.mockResolvedValue(job('processing', 'wrun_same'));
    mocks.resolveUserTier.mockResolvedValue('pro');

    await expect(reservePlanRegenerationAttemptStep(input)).resolves.toEqual(
      expect.objectContaining({
        reservation: toSerializableReservation(reservation),
        tier: 'pro',
        generationInput: expect.objectContaining({
          topic: plan.topic,
          skillLevel: plan.skillLevel,
          weeklyHours: plan.weeklyHours,
          learningStyle: plan.learningStyle,
        }),
        modelOverride: savedSlots.preferredRegenerationAiModel,
      }),
    );
    expect(mocks.reserveAttemptSlot).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: input.planId,
        userId: input.userId,
        generationPurpose: 'regeneration',
        workflowMetadata: {
          provider: 'workflow-sdk',
          runId: 'wrun_same',
          idempotencyKey: `plan-regeneration:${input.jobId}:0`,
        },
      }),
    );
  });

  it('reuses the admitted tier when a reserve replay sees a changed current tier', async () => {
    const reservation = makeAttemptReservation({
      generationPurpose: 'regeneration',
      admittedTier: 'pro',
    });
    mocks.reserveAttemptSlot.mockResolvedValue(reservation);
    mocks.findAttemptWithWorkflowIdempotencyKey.mockResolvedValue({
      admittedTier: 'pro',
    });
    mocks.loadJob.mockResolvedValue(job('processing', 'wrun_same'));
    mocks.resolveUserTier.mockResolvedValue('free');

    const replay = await reservePlanRegenerationAttemptStep(input);

    expect(replay.tier).toBe('pro');
    expect(mocks.resolveUserTier).not.toHaveBeenCalled();
    expect(mocks.failJob).not.toHaveBeenCalled();
  });

  it('compensates a reservation when the admitted tier changes to Free', async () => {
    const reservation = makeAttemptReservation({
      generationPurpose: 'regeneration',
      admittedTier: 'free',
    });
    mocks.reserveAttemptSlot.mockResolvedValue(reservation);
    mocks.loadJob.mockResolvedValue(job('processing', 'wrun_same'));
    mocks.resolveUserTier.mockResolvedValue('pro');

    await expect(reservePlanRegenerationAttemptStep(input)).rejects.toThrow(
      'Plan regeneration is not included on the Free plan.',
    );

    expect(mocks.commitPlanGenerationFailure).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        attemptId: reservation.attemptId,
        classification: 'validation',
        retryable: false,
      }),
    );
    expect(mocks.failJob).toHaveBeenCalledWith(
      input.jobId,
      'Plan regeneration is not included on the Free plan.',
      { retryable: false },
    );
  });

  it('passes the payload model override to processGenerationAttempt', async () => {
    const queued = job('processing', 'wrun_same');
    queued.data = {
      ...queued.data,
      overrides: { model: 'google/gemini-3-flash-preview' },
    };
    mocks.loadJob.mockResolvedValue(queued);
    mocks.resolveUserTier.mockResolvedValue('pro');

    const reserved = await reservePlanRegenerationAttemptStep(input);

    await processPlanRegenerationStep(input, reserved);

    expect(processGenerationAttemptWithReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        generationPurpose: 'regeneration',
        modelOverride: 'google/gemini-3-flash-preview',
      }),
      expect.objectContaining({
        attemptId: serializedReservation.attemptId,
      }),
    );
  });

  it('uses the Pro regeneration saved slot when the payload has no model', async () => {
    mocks.loadJob.mockResolvedValue(job('processing', 'wrun_same'));
    mocks.resolveUserTier.mockResolvedValue('pro');
    const reserved = await reservePlanRegenerationAttemptStep(input);

    await processPlanRegenerationStep(input, reserved);

    expect(processGenerationAttemptWithReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        generationPurpose: 'regeneration',
        modelOverride: savedSlots.preferredRegenerationAiModel,
      }),
      expect.objectContaining({
        attemptId: serializedReservation.attemptId,
      }),
    );
  });

  it('uses the Starter outline slot when the payload has no model', async () => {
    mocks.loadJob.mockResolvedValue(job('processing', 'wrun_same'));
    mocks.resolveUserTier.mockResolvedValue('starter');
    const reserved = await reservePlanRegenerationAttemptStep(input);

    await processPlanRegenerationStep(input, reserved);

    expect(processGenerationAttemptWithReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        generationPurpose: 'regeneration',
        modelOverride: savedSlots.preferredAiModel,
      }),
      expect.objectContaining({
        attemptId: serializedReservation.attemptId,
      }),
    );
  });

  it('uses the validated preparation when the current tier changes after reservation', async () => {
    mocks.loadJob.mockResolvedValue(job('processing', 'wrun_same'));
    mocks.resolveUserTier.mockResolvedValue('pro');

    const reserved = await reservePlanRegenerationAttemptStep(input);
    mocks.resolveUserTier.mockResolvedValue('free');

    await processPlanRegenerationStep(input, reserved);

    expect(processGenerationAttemptWithReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'pro',
        modelOverride: savedSlots.preferredRegenerationAiModel,
      }),
      expect.objectContaining({
        attemptId: serializedReservation.attemptId,
      }),
    );
  });

  it('fails closed for Free without invoking the provider', async () => {
    mocks.loadJob.mockResolvedValue(job('processing', 'wrun_same'));
    mocks.resolveUserTier.mockResolvedValue('free');

    await expect(reservePlanRegenerationAttemptStep(input)).rejects.toThrow(
      'Plan regeneration is not included on the Free plan.',
    );
    expect(processGenerationAttemptWithReservation).not.toHaveBeenCalled();
    expect(mocks.failJob).toHaveBeenCalledWith(
      input.jobId,
      'Plan regeneration is not included on the Free plan.',
      { retryable: false },
    );
    expect(
      mocks.reserveRegenerationQuotaAtProviderStart,
    ).not.toHaveBeenCalled();
  });

  it('fails closed for Starter duration over 8 weeks without invoking the provider', async () => {
    mocks.loadAuthorizedRegenerationPlan.mockResolvedValue({
      ...plan,
      startDate: '2026-01-01',
      deadlineDate: '2026-04-01',
    });
    mocks.loadJob.mockResolvedValue(job('processing', 'wrun_same'));
    mocks.resolveUserTier.mockResolvedValue('starter');

    await expect(reservePlanRegenerationAttemptStep(input)).rejects.toThrow(
      /starter tier limited to 8-week plans/i,
    );
    expect(processGenerationAttemptWithReservation).not.toHaveBeenCalled();
    expect(
      mocks.reserveRegenerationQuotaAtProviderStart,
    ).not.toHaveBeenCalled();
  });

  it('settles quota once onAttemptReserved fires', async () => {
    processGenerationAttemptWithReservation.mockImplementation(
      async (args: {
        onAttemptReserved?: (
          reservation: AttemptReservation,
        ) => void | Promise<void>;
      }) => {
        await args.onAttemptReserved?.({} as AttemptReservation);
        return {
          status: 'generation_success',
          data: { modules: [], metadata: {}, durationMs: 1 },
        };
      },
    );
    mocks.loadJob.mockResolvedValue(job('processing', 'wrun_same'));
    await processPlanRegenerationStep(input, preparation);

    expect(mocks.reserveRegenerationQuotaAtProviderStart).toHaveBeenCalledWith({
      userId: input.userId,
      planId: input.planId,
      jobId: input.jobId,
      dbClient: expect.anything(),
    });
  });

  it('does not invoke the provider when marker settlement fails', async () => {
    let providerInvoked = false;
    const markerError = new Error('marker persistence failed');
    processGenerationAttemptWithReservation.mockImplementation(
      async (args: {
        onAttemptReserved?: (
          reservation: AttemptReservation,
        ) => void | Promise<void>;
      }) => {
        try {
          await args.onAttemptReserved?.({} as AttemptReservation);
        } catch (error) {
          return {
            status: 'retryable_failure',
            classification: 'provider_error',
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }
        providerInvoked = true;
        return {
          status: 'generation_success',
          data: { modules: [], metadata: {}, durationMs: 1 },
        };
      },
    );
    mocks.reserveRegenerationQuotaAtProviderStart.mockRejectedValue(
      markerError,
    );
    mocks.loadJob.mockResolvedValue(job('processing', 'wrun_same'));
    mocks.resolveUserTier.mockResolvedValue('pro');

    const result = await processPlanRegenerationStep(input, preparation);

    expect(providerInvoked).toBe(false);
    expect(result).toMatchObject({ status: 'retryable_failure' });
  });

  it('allows a replay with an already-settled marker to reach the provider', async () => {
    processGenerationAttemptWithReservation.mockImplementation(
      async (args: {
        onAttemptReserved?: (
          reservation: AttemptReservation,
        ) => void | Promise<void>;
      }) => {
        await args.onAttemptReserved?.({} as AttemptReservation);
        return {
          status: 'generation_success',
          data: { modules: [], metadata: {}, durationMs: 1 },
        };
      },
    );
    mocks.reserveRegenerationQuotaAtProviderStart.mockResolvedValue({
      ok: true,
      providerStartedAt: '2026-06-22T18:00:00.000Z',
      alreadySettled: true,
    });
    mocks.loadJob.mockResolvedValue(job('processing', 'wrun_same'));
    mocks.resolveUserTier.mockResolvedValue('pro');

    await expect(
      processPlanRegenerationStep(input, preparation),
    ).resolves.toMatchObject({
      status: 'generation_success',
    });
    expect(mocks.reserveRegenerationQuotaAtProviderStart).toHaveBeenCalledTimes(
      1,
    );
  });
});
