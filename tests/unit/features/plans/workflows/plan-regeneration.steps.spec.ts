import type { Job } from '@/features/jobs/types';
import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { RegenerationPlanRow } from '@/features/plans/regeneration-orchestration/process-workflow-support';
import type { PlanRegenerationWorkflowInput } from '@/features/plans/workflows/plan-regeneration.types';

import { planRegenerationJobPayloadSchema } from '@/features/plans/regeneration-orchestration/schema';
import {
  claimPlanRegenerationJobStep,
  processPlanRegenerationStep,
} from '@/features/plans/workflows/plan-regeneration.steps';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({
  claimJob: vi.fn(),
  loadJob: vi.fn(),
  updateJobPayload: vi.fn(),
  updateJobPayloadIfRunIdMissing: vi.fn(),
  failJob: vi.fn(),
  getWorkflowMetadata: vi.fn(),
  createPlanLifecycleService: vi.fn(),
  resolveUserTier: vi.fn(),
  getUserPreferences: vi.fn(),
  loadAuthorizedRegenerationPlan: vi.fn(),
  runRegenerationQuotaReserved: vi.fn(),
}));

vi.mock('@/features/jobs/queue', () => ({
  claimRegenerationJob: mocks.claimJob,
  loadJobById: mocks.loadJob,
  updateJobPayload: mocks.updateJobPayload,
  updateJobPayloadIfRunIdMissing: mocks.updateJobPayloadIfRunIdMissing,
  failJob: mocks.failJob,
}));

vi.mock('@/features/billing/regeneration-quota-boundary', () => ({
  runRegenerationQuotaReserved: mocks.runRegenerationQuotaReserved,
}));

vi.mock('@/features/plans/lifecycle/factory', () => ({
  createPlanLifecycleService: mocks.createPlanLifecycleService,
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
  const processGenerationAttempt = vi.fn();
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
    processGenerationAttempt.mockReset();
    processGenerationAttempt.mockResolvedValue({
      status: 'generation_success',
      data: { modules: [], metadata: {}, durationMs: 1 },
    });
    mocks.loadJob.mockReset();
    mocks.resolveUserTier.mockReset();
    mocks.getUserPreferences.mockReset();
    mocks.loadAuthorizedRegenerationPlan.mockReset();
    mocks.createPlanLifecycleService.mockReset();
    mocks.createPlanLifecycleService.mockReturnValue({
      processGenerationAttempt,
    } as unknown as PlanLifecycleService);
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
    mocks.runRegenerationQuotaReserved.mockReset();
    mocks.runRegenerationQuotaReserved.mockImplementation(
      async (args: {
        work: () => Promise<{
          disposition: 'consumed' | 'revert';
          value: unknown;
        }>;
      }) => {
        const workResult = await args.work();
        return {
          ok: true as const,
          consumed: workResult.disposition === 'consumed',
          value: workResult.value,
          reconciliationRequired: false as const,
        };
      },
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

    await processPlanRegenerationStep(input);

    expect(processGenerationAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        generationPurpose: 'regeneration',
        modelOverride: 'google/gemini-3-flash-preview',
      }),
    );
  });

  it('uses the Pro regeneration saved slot when the payload has no model', async () => {
    mocks.loadJob.mockResolvedValue(job('processing', 'wrun_same'));
    mocks.resolveUserTier.mockResolvedValue('pro');

    await processPlanRegenerationStep(input);

    expect(processGenerationAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        generationPurpose: 'regeneration',
        modelOverride: savedSlots.preferredRegenerationAiModel,
      }),
    );
  });

  it('uses the Starter outline slot when the payload has no model', async () => {
    mocks.loadJob.mockResolvedValue(job('processing', 'wrun_same'));
    mocks.resolveUserTier.mockResolvedValue('starter');

    await processPlanRegenerationStep(input);

    expect(processGenerationAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        generationPurpose: 'regeneration',
        modelOverride: savedSlots.preferredAiModel,
      }),
    );
  });

  it('fails closed for Free without invoking the provider', async () => {
    mocks.loadJob.mockResolvedValue(job('processing', 'wrun_same'));
    mocks.resolveUserTier.mockResolvedValue('free');

    await expect(processPlanRegenerationStep(input)).rejects.toThrow(
      'Plan regeneration is not included on the Free plan.',
    );
    expect(processGenerationAttempt).not.toHaveBeenCalled();
    expect(mocks.failJob).toHaveBeenCalledWith(
      input.jobId,
      'Plan regeneration is not included on the Free plan.',
      { retryable: false },
    );
    expect(mocks.runRegenerationQuotaReserved).not.toHaveBeenCalled();
  });

  it('fails closed for Starter duration over 8 weeks without invoking the provider', async () => {
    mocks.loadAuthorizedRegenerationPlan.mockResolvedValue({
      ...plan,
      startDate: '2026-01-01',
      deadlineDate: '2026-04-01',
    });
    mocks.loadJob.mockResolvedValue(job('processing', 'wrun_same'));
    mocks.resolveUserTier.mockResolvedValue('starter');

    await expect(processPlanRegenerationStep(input)).rejects.toThrow(
      /starter tier limited to 8-week plans/i,
    );
    expect(processGenerationAttempt).not.toHaveBeenCalled();
    expect(mocks.runRegenerationQuotaReserved).not.toHaveBeenCalled();
  });

  it('consumes quota once onAttemptReserved fires', async () => {
    let disposition: 'consumed' | 'revert' | undefined;
    processGenerationAttempt.mockImplementation(
      async (args: { onAttemptReserved?: () => void | Promise<void> }) => {
        await args.onAttemptReserved?.();
        return {
          status: 'generation_success',
          data: { modules: [], metadata: {}, durationMs: 1 },
        };
      },
    );
    mocks.runRegenerationQuotaReserved.mockImplementation(
      async (args: {
        work: () => Promise<{
          disposition: 'consumed' | 'revert';
          value: unknown;
        }>;
      }) => {
        const workResult = await args.work();
        disposition = workResult.disposition;
        return {
          ok: true as const,
          consumed: workResult.disposition === 'consumed',
          value: workResult.value,
          reconciliationRequired: false as const,
        };
      },
    );
    mocks.loadJob.mockResolvedValue(job('processing', 'wrun_same'));
    mocks.resolveUserTier.mockResolvedValue('pro');

    await processPlanRegenerationStep(input);

    expect(disposition).toBe('consumed');
    expect(mocks.updateJobPayload).toHaveBeenCalledWith(
      input.jobId,
      expect.objectContaining({
        quota: expect.objectContaining({
          providerStartedAt: expect.any(String),
        }),
      }),
    );
  });

  it('fails closed when the provider-start payload cannot be parsed', async () => {
    let continued = false;
    processGenerationAttempt.mockImplementation(
      async (args: { onAttemptReserved?: () => void | Promise<void> }) => {
        await args.onAttemptReserved?.();
        continued = true;
        return {
          status: 'generation_success',
          data: { modules: [], metadata: {}, durationMs: 1 },
        };
      },
    );
    mocks.loadJob.mockResolvedValue(job('processing', 'wrun_same'));
    mocks.resolveUserTier.mockResolvedValue('pro');

    const parsePayload = planRegenerationJobPayloadSchema.safeParse.bind(
      planRegenerationJobPayloadSchema,
    );
    const safeParse = vi.spyOn(planRegenerationJobPayloadSchema, 'safeParse');
    safeParse.mockImplementation((payload) => {
      if (
        typeof payload === 'object' &&
        payload !== null &&
        'quota' in payload
      ) {
        return {
          success: false,
          error: new z.ZodError([]),
        } as ReturnType<typeof planRegenerationJobPayloadSchema.safeParse>;
      }

      return parsePayload(payload);
    });

    try {
      const result = await processPlanRegenerationStep(input);

      expect(continued).toBe(false);
      expect(result).toMatchObject({ status: 'retryable_failure' });
      expect(mocks.updateJobPayload).not.toHaveBeenCalled();
    } finally {
      safeParse.mockRestore();
    }
  });

  it.each([
    {
      name: 'rejects the update',
      configure: () => {
        mocks.updateJobPayload.mockRejectedValue(
          new Error('job update failed'),
        );
      },
    },
    {
      name: 'returns no job',
      configure: () => {
        mocks.updateJobPayload.mockResolvedValue(null);
      },
    },
    {
      name: 'returns a terminal job',
      configure: () => {
        mocks.updateJobPayload.mockImplementation(
          async (_jobId: string, payload: Job['data']) => ({
            ...job('completed', 'wrun_same'),
            data: payload,
          }),
        );
      },
    },
    {
      name: 'returns processing without the marker',
      configure: () => {
        mocks.updateJobPayload.mockImplementation(async () =>
          job('processing'),
        );
      },
    },
    {
      name: 'returns processing with a mismatched marker',
      configure: () => {
        mocks.updateJobPayload.mockImplementation(
          async (_jobId: string, payload: Job['data']) => ({
            ...job('processing', 'wrun_same'),
            data: {
              ...payload,
              quota: { providerStartedAt: '2026-06-22T18:00:00.000Z' },
            },
          }),
        );
      },
    },
  ])('$name before continuing generation', async ({ configure }) => {
    let continued = false;
    processGenerationAttempt.mockImplementation(
      async (args: { onAttemptReserved?: () => void | Promise<void> }) => {
        await args.onAttemptReserved?.();
        continued = true;
        return {
          status: 'generation_success',
          data: { modules: [], metadata: {}, durationMs: 1 },
        };
      },
    );
    configure();
    mocks.loadJob.mockResolvedValue(job('processing', 'wrun_same'));
    mocks.resolveUserTier.mockResolvedValue('pro');

    const result = await processPlanRegenerationStep(input);

    expect(continued).toBe(false);
    expect(result).toMatchObject({ status: 'retryable_failure' });
  });
});
