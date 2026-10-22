import type { Job } from '@/features/jobs/types';
import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { RegenerationPlanRow } from '@/features/plans/regeneration-orchestration/process-workflow-support';
import type { AttemptReservation } from '@/lib/db/queries/types/attempts.types';

import { makeAttemptReservation } from '../../../fixtures/attempts';
import { makeCanonicalUsage } from '../../../fixtures/canonical-usage.factory';
import {
  PLAN_REGENERATION_FAILURE_MESSAGE,
  runPlanRegeneration,
  terminalizeAbandonedRegenerationRun,
} from '@/features/jobs/regeneration-run';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claimJob: vi.fn(),
  loadJob: vi.fn(),
  updateJobPayload: vi.fn(),
  failJob: vi.fn(),
  completeJob: vi.fn(),
  createPlanLifecycleService: vi.fn(),
  processGenerationAttemptWithReservation: vi.fn(),
  settleReservedAttemptFailure: vi.fn(),
  resolveUserTier: vi.fn(),
  getUserPreferences: vi.fn(),
  getGroundedModelPreferences: vi.fn(),
  loadAuthorizedRegenerationPlan: vi.fn(),
  reserveRegenerationQuotaAtProviderStart: vi.fn(),
  findAttemptWithWorkflowIdempotencyKey: vi.fn(),
  reserveAttemptSlot: vi.fn(),
  scheduledFor: vi.fn(),
  runGenerationWithReservation: vi.fn(),
  settleGenerationResult: vi.fn(),
  getLatestPlanResearch: vi.fn(),
  createGroundedOutlineProvider: vi.fn(),
  updatePlan: vi.fn(),
}));

vi.mock('@/features/jobs/queue', () => ({
  claimRegenerationJob: mocks.claimJob,
  loadJobById: mocks.loadJob,
  updateJobPayload: mocks.updateJobPayload,
  failJob: mocks.failJob,
}));

vi.mock('@/features/billing/regeneration-quota-boundary', () => ({
  reserveRegenerationQuotaAtProviderStart:
    mocks.reserveRegenerationQuotaAtProviderStart,
}));

vi.mock('@/features/plans/lifecycle/factory', () => ({
  createPlanLifecycleService: mocks.createPlanLifecycleService,
}));

vi.mock('@/lib/db/queries/attempts', () => ({
  findAttemptWithWorkflowIdempotencyKey:
    mocks.findAttemptWithWorkflowIdempotencyKey,
  reserveAttemptSlot: mocks.reserveAttemptSlot,
}));

vi.mock('@/features/billing/tier', () => ({
  resolveUserTier: mocks.resolveUserTier,
}));

vi.mock('@/lib/db/queries/plan-research', () => ({
  getLatestPlanResearch: mocks.getLatestPlanResearch,
}));

vi.mock('@/features/plans/outline/grounded-writer', () => ({
  createGroundedOutlineProvider: mocks.createGroundedOutlineProvider,
}));

vi.mock('@/lib/db/queries/user-preferences', () => ({
  getUserPreferences: mocks.getUserPreferences,
  getGroundedModelPreferences: mocks.getGroundedModelPreferences,
}));

vi.mock('@/features/plans/regeneration-orchestration/deps', () => ({
  createDefaultRegenerationOrchestrationDeps: vi.fn(() => ({
    queue: { completeJob: mocks.completeJob, failJob: mocks.failJob },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  })),
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

// `select({ scheduledFor }).from(jobQueue).where(...).limit(1)`;
// `update(learningPlans).set(feedback).where(...)`
vi.mock('@supabase/service-role', () => ({
  db: {
    update: () => ({
      set: (values: unknown) => ({
        where: async () => mocks.updatePlan(values),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ scheduledFor: mocks.scheduledFor() }],
        }),
      }),
    }),
  },
}));

const RUN_ID = 'msg-1';
const JOB_ID = 'e6e5528d-1871-45d2-a055-7bc03f2ca8f8';
const PLAN_ID = '0c834f38-e9e1-4c7d-bdc0-2e28c505256a';
const USER_ID = '353d54b9-f3d0-4aa6-8c74-33956019cb71';
const RETRY_AT = new Date('2026-06-22T18:05:00.000Z');
const startModuleLessons = vi.fn();
const context = { runId: RUN_ID, startModuleLessons };

function job(status: Job['status'], runId?: string, attempts = 0): Job {
  const now = new Date('2026-06-22T18:00:00.000Z');
  return {
    id: JOB_ID,
    type: 'plan_regeneration',
    planId: PLAN_ID,
    userId: USER_ID,
    status,
    priority: 0,
    attempts,
    maxAttempts: 3,
    data: {
      planId: PLAN_ID,
      ...(runId
        ? {
            workflow: {
              provider: 'cloudflare-queue' as const,
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

const plan = {
  id: PLAN_ID,
  userId: USER_ID,
  topic: 'rust',
  skillLevel: 'beginner',
  weeklyHours: 5,
  learningStyle: 'mixed',
  startDate: null,
  deadlineDate: null,
} as unknown as RegenerationPlanRow;

/** Job rows seen by successive `loadJobById` calls. */
function jobSequence(...rows: Array<Job | null>) {
  const queue = [...rows];
  mocks.loadJob.mockImplementation(async () =>
    queue.length > 1 ? queue.shift() : queue[0],
  );
}

/** Lets the lifecycle reach the provider: fires `onAttemptReserved`, then returns `result`. */
function providerReturns(result: unknown) {
  mocks.processGenerationAttemptWithReservation.mockImplementation(
    async (args: {
      onAttemptReserved?: (reservation: AttemptReservation) => Promise<void>;
    }) => {
      await args.onAttemptReserved?.({} as AttemptReservation);
      return result;
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createPlanLifecycleService.mockReturnValue({
    processGenerationAttemptWithReservation:
      mocks.processGenerationAttemptWithReservation,
    settleReservedAttemptFailure: mocks.settleReservedAttemptFailure,
    runGenerationWithReservation: mocks.runGenerationWithReservation,
    settleGenerationResult: mocks.settleGenerationResult,
  } as unknown as PlanLifecycleService);
  mocks.claimJob.mockImplementation(async () => job('processing', RUN_ID));
  mocks.updateJobPayload.mockResolvedValue(null);
  mocks.failJob.mockResolvedValue(job('pending'));
  mocks.completeJob.mockResolvedValue(null);
  mocks.loadAuthorizedRegenerationPlan.mockResolvedValue(plan);
  mocks.resolveUserTier.mockResolvedValue('pro');
  mocks.getUserPreferences.mockResolvedValue({
    preferredAiModel: 'openai/gpt-6.1-sol',
    preferredRegenerationAiModel: 'anthropic/claude-sonnet-5.5',
    preferredLessonAiModel: 'anthropic/claude-haiku-5.5',
    analyticsTimezone: 'UTC',
  });
  mocks.getGroundedModelPreferences.mockResolvedValue({
    preferredWriterAiModel: null,
    preferredVerifierAiModel: null,
    preferredAdvisorAiModel: null,
  });
  mocks.findAttemptWithWorkflowIdempotencyKey.mockResolvedValue(null);
  mocks.reserveAttemptSlot.mockResolvedValue(
    makeAttemptReservation({ generationPurpose: 'regeneration' }),
  );
  mocks.reserveRegenerationQuotaAtProviderStart.mockResolvedValue({
    ok: true,
    providerStartedAt: '2026-06-22T18:00:00.000Z',
    alreadySettled: false,
  });
  mocks.scheduledFor.mockReturnValue(RETRY_AT);
  providerReturns({
    status: 'generation_success',
    data: { modules: [{ tasks: [{}, {}] }], metadata: {}, durationMs: 12 },
  });
});

describe('runPlanRegeneration claim', () => {
  it('claims a pending job with the cloudflare-queue marker and completes it', async () => {
    jobSequence(job('pending'), job('pending'), job('processing', RUN_ID));

    await expect(runPlanRegeneration(JOB_ID, context)).resolves.toEqual({
      kind: 'completed',
      jobId: JOB_ID,
      planId: PLAN_ID,
    });

    expect(mocks.claimJob).toHaveBeenCalledWith(
      JOB_ID,
      { planId: PLAN_ID, userId: USER_ID },
      expect.objectContaining({
        workflow: expect.objectContaining({
          provider: 'cloudflare-queue',
          runId: RUN_ID,
        }),
      }),
    );
    expect(mocks.reserveAttemptSlot).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowMetadata: {
          provider: 'cloudflare-queue',
          runId: RUN_ID,
          idempotencyKey: `plan-regeneration:${JOB_ID}:0`,
        },
      }),
    );
    expect(mocks.updateJobPayload).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({
        workflow: expect.objectContaining({
          provider: 'cloudflare-queue',
          runId: RUN_ID,
          completedAt: expect.any(String),
        }),
      }),
    );
    expect(mocks.completeJob).toHaveBeenCalledWith(JOB_ID, {
      planId: PLAN_ID,
      modulesCount: 1,
      tasksCount: 2,
      durationMs: 12,
    });
  });

  it('injects the Worker lesson starter into lifecycle finalization', async () => {
    jobSequence(job('pending'), job('pending'), job('processing', RUN_ID));

    await runPlanRegeneration(JOB_ID, context);

    expect(mocks.createPlanLifecycleService).toHaveBeenCalledWith(
      expect.objectContaining({ startModuleLessons }),
    );
  });

  it('acknowledges a losing message while another run owns the job', async () => {
    jobSequence(job('processing', 'msg-rival'));

    await expect(runPlanRegeneration(JOB_ID, context)).resolves.toEqual({
      kind: 'in-flight',
      jobId: JOB_ID,
      runId: 'msg-rival',
    });
    expect(mocks.claimJob).not.toHaveBeenCalled();
    expect(mocks.reserveAttemptSlot).not.toHaveBeenCalled();
    expect(
      mocks.processGenerationAttemptWithReservation,
    ).not.toHaveBeenCalled();
  });

  it('loses the CAS claim race to a rival run without doing work', async () => {
    jobSequence(job('pending'), job('pending'), job('processing', 'msg-rival'));
    mocks.claimJob.mockResolvedValue(null);

    await expect(runPlanRegeneration(JOB_ID, context)).resolves.toEqual({
      kind: 'in-flight',
      jobId: JOB_ID,
      runId: 'msg-rival',
    });
    expect(mocks.reserveAttemptSlot).not.toHaveBeenCalled();
  });

  it('resumes its own run on redelivery of the same message', async () => {
    jobSequence(job('processing', RUN_ID));

    await expect(runPlanRegeneration(JOB_ID, context)).resolves.toMatchObject({
      kind: 'completed',
    });
    expect(mocks.claimJob).not.toHaveBeenCalled();
    expect(mocks.reserveAttemptSlot).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['completed', 'already-completed'],
    ['failed', 'already-failed'],
  ] as const)('skips a %s job', async (status, kind) => {
    jobSequence(job(status));

    await expect(runPlanRegeneration(JOB_ID, context)).resolves.toEqual({
      kind,
      jobId: JOB_ID,
    });
    expect(mocks.failJob).not.toHaveBeenCalled();
  });

  it('reports a missing job without touching the queue', async () => {
    jobSequence(null);

    await expect(runPlanRegeneration(JOB_ID, context)).resolves.toEqual({
      kind: 'job-not-found',
      jobId: JOB_ID,
    });
    expect(mocks.failJob).not.toHaveBeenCalled();
  });
});

describe('runPlanRegeneration quota settlement', () => {
  beforeEach(() => {
    jobSequence(job('pending'), job('pending'), job('processing', RUN_ID));
  });

  it('does not consume quota when reservation is rate limited before the provider', async () => {
    mocks.reserveAttemptSlot.mockResolvedValue({
      reserved: false,
      reason: 'rate_limited',
      retryAfter: 300,
    });

    await expect(runPlanRegeneration(JOB_ID, context)).resolves.toEqual({
      kind: 'retry-scheduled',
      jobId: JOB_ID,
      planId: PLAN_ID,
      scheduledFor: RETRY_AT,
    });
    expect(mocks.failJob).toHaveBeenCalledWith(
      JOB_ID,
      'Unable to reserve regeneration attempt: rate_limited.',
      { retryable: true, retryAfter: 300 },
    );
    expect(
      mocks.processGenerationAttemptWithReservation,
    ).not.toHaveBeenCalled();
    expect(
      mocks.reserveRegenerationQuotaAtProviderStart,
    ).not.toHaveBeenCalled();
  });

  it('does not consume quota when admission denies the run before reserving', async () => {
    mocks.resolveUserTier.mockResolvedValue('free');

    await expect(runPlanRegeneration(JOB_ID, context)).resolves.toEqual({
      kind: 'permanent-failure',
      jobId: JOB_ID,
      planId: PLAN_ID,
    });
    expect(mocks.failJob).toHaveBeenCalledWith(
      JOB_ID,
      'Plan regeneration is not included on the Free plan.',
      { retryable: false },
    );
    expect(mocks.reserveAttemptSlot).not.toHaveBeenCalled();
    expect(
      mocks.reserveRegenerationQuotaAtProviderStart,
    ).not.toHaveBeenCalled();
  });

  it('keeps quota consumed when the provider started and then failed', async () => {
    providerReturns({
      status: 'retryable_failure',
      classification: 'timeout',
      error: new Error('timeout'),
    });

    await expect(runPlanRegeneration(JOB_ID, context)).resolves.toEqual({
      kind: 'retry-scheduled',
      jobId: JOB_ID,
      planId: PLAN_ID,
      scheduledFor: RETRY_AT,
    });
    expect(mocks.reserveRegenerationQuotaAtProviderStart).toHaveBeenCalledTimes(
      1,
    );
    expect(mocks.reserveRegenerationQuotaAtProviderStart).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        planId: PLAN_ID,
        jobId: JOB_ID,
      }),
    );
    expect(mocks.failJob).toHaveBeenCalledWith(
      JOB_ID,
      'Plan regeneration failed (timeout).',
      { retryable: true },
    );
  });

  it('ends the run as a permanent failure when retries are exhausted', async () => {
    providerReturns({
      status: 'retryable_failure',
      classification: 'timeout',
      error: new Error('timeout'),
    });
    mocks.failJob.mockResolvedValue(job('failed'));

    await expect(runPlanRegeneration(JOB_ID, context)).resolves.toEqual({
      kind: 'retryable-failure',
      jobId: JOB_ID,
      planId: PLAN_ID,
      willRetry: false,
    });
  });

  it('fails the job without retry when quota is exhausted at provider start', async () => {
    mocks.reserveRegenerationQuotaAtProviderStart.mockResolvedValue({
      ok: false,
    });
    mocks.processGenerationAttemptWithReservation.mockImplementation(
      async (args: {
        onAttemptReserved?: (reservation: AttemptReservation) => Promise<void>;
      }) => {
        await args
          .onAttemptReserved?.({} as AttemptReservation)
          .catch(() => {});
        return {
          status: 'permanent_failure',
          classification: 'validation',
          error: new Error('quota'),
        };
      },
    );

    await expect(runPlanRegeneration(JOB_ID, context)).resolves.toEqual({
      kind: 'permanent-failure',
      jobId: JOB_ID,
      planId: PLAN_ID,
    });
    expect(mocks.failJob).toHaveBeenNthCalledWith(
      1,
      JOB_ID,
      'Regeneration quota exceeded for your subscription tier.',
      { retryable: false },
    );
    expect(mocks.failJob).toHaveBeenNthCalledWith(
      2,
      JOB_ID,
      PLAN_REGENERATION_FAILURE_MESSAGE,
      { retryable: false },
    );
  });

  it('propagates unexpected errors so the consumer can retry the message', async () => {
    const outage = new Error('database unreachable');
    mocks.reserveAttemptSlot.mockRejectedValue(outage);

    await expect(runPlanRegeneration(JOB_ID, context)).rejects.toBe(outage);
    expect(mocks.failJob).not.toHaveBeenCalled();
  });
});

describe('runPlanRegeneration grounded (JCS-162)', () => {
  const FEEDBACK = { reasons: ['too_basic'], note: 'More practice please' };
  const MODULES = [{ title: 'Written', tasks: [{}, {}] }];
  const CHECKED = [{ title: 'Checked', tasks: [{}, {}, {}] }];
  const BRIEF = {
    brief: 'Fresh brief [S1]',
    sources: [
      {
        key: 'S1',
        title: 'Rust book',
        url: 'https://doc.rust-lang.org/book/',
        publisher: 'rust-lang.org',
      },
    ],
  };
  const SAVED_ROW = {
    research: { status: 'ok', brief: 'Saved brief [S1]' },
    sources: [
      {
        citationKey: 'S1',
        title: 'Rust book',
        url: 'https://doc.rust-lang.org/book/',
        publisher: 'rust-lang.org',
      },
    ],
  };

  const stages = {
    isEnabled: vi.fn(() => true),
    research: vi.fn(),
    outlineQuality: vi.fn(),
  };
  const groundedContext = { ...context, grounded: stages };
  const order: string[] = [];

  function groundedJob(status: Job['status'], runId?: string): Job {
    const row = job(status, runId);
    return { ...row, data: { ...row.data, ...FEEDBACK } };
  }

  /** The lifecycle as the Worker sees it: provider start, outline, settle. */
  function lifecycleRuns() {
    mocks.runGenerationWithReservation.mockImplementation(
      async (args: { onAttemptReserved?: () => Promise<void> }) => {
        await args.onAttemptReserved?.();
        const provider = mocks.createPlanLifecycleService.mock.calls.at(-1)?.[0]
          .generationProvider as {
          generate: (input: unknown, options: unknown) => Promise<unknown>;
        };
        await provider.generate({}, {});
        order.push('outline');
        return {
          status: 'success',
          modules: MODULES,
          usage: makeCanonicalUsage({ providerCostMicrousd: 4_000 }),
        };
      },
    );
    mocks.settleGenerationResult.mockImplementation(async () => {
      order.push('settle');
      return {
        status: 'generation_success',
        data: { modules: CHECKED, metadata: {}, durationMs: 12 },
      };
    });
  }

  beforeEach(() => {
    order.length = 0;
    jobSequence(
      groundedJob('pending'),
      groundedJob('pending'),
      groundedJob('processing', RUN_ID),
    );
    stages.isEnabled.mockReturnValue(true);
    stages.research.mockImplementation(async () => {
      order.push('research');
      return BRIEF;
    });
    stages.outlineQuality.mockImplementation(async () => {
      order.push('quality');
      return {
        modules: CHECKED,
        usages: [makeCanonicalUsage({ providerCostMicrousd: 1_500 })],
      };
    });
    mocks.createGroundedOutlineProvider.mockReturnValue({
      generate: vi.fn(async () => ({})),
    });
    mocks.updatePlan.mockImplementation(() => {
      order.push('feedback');
    });
    lifecycleRuns();
  });

  it('reruns research on paid tiers, steered by the reasons and note', async () => {
    await expect(
      runPlanRegeneration(JOB_ID, groundedContext),
    ).resolves.toMatchObject({ kind: 'completed' });

    expect(order).toEqual([
      'research',
      'outline',
      'quality',
      'feedback',
      'settle',
    ]);
    const [stage] = stages.research.mock.calls[0] ?? [];
    expect(stage).toMatchObject({ planId: PLAN_ID, tier: 'pro' });
    expect(stage.guidance).toContain('REGENERATION FEEDBACK');
    expect(stage.guidance).toContain(
      '---BEGIN LEARNER NOTE---\nMore practice please\n---END LEARNER NOTE---',
    );
    expect(mocks.createGroundedOutlineProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'pro',
        research: BRIEF,
        guidance: stage.guidance,
      }),
    );
    expect(stages.outlineQuality).toHaveBeenCalledWith(
      expect.objectContaining({ research: BRIEF }),
      MODULES,
    );
    expect(mocks.settleGenerationResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'success',
        modules: CHECKED,
        // Outline verifier and repair spend is recorded with the outline's.
        usage: expect.objectContaining({ providerCostMicrousd: 5_500 }),
      }),
    );
    expect(mocks.reserveRegenerationQuotaAtProviderStart).toHaveBeenCalledWith(
      expect.objectContaining({ groundedTier: 'pro' }),
    );
    expect(mocks.updatePlan).toHaveBeenCalledWith({
      regenerationReasons: ['too_basic'],
      regenerationNote: 'More practice please',
    });
    expect(mocks.getLatestPlanResearch).not.toHaveBeenCalled();
    expect(
      mocks.processGenerationAttemptWithReservation,
    ).not.toHaveBeenCalled();
  });

  it('admits Free and reuses the saved brief instead of researching', async () => {
    mocks.resolveUserTier.mockResolvedValue('free');
    mocks.getLatestPlanResearch.mockResolvedValue(SAVED_ROW);

    await expect(
      runPlanRegeneration(JOB_ID, groundedContext),
    ).resolves.toMatchObject({ kind: 'completed' });

    expect(stages.research).not.toHaveBeenCalled();
    expect(mocks.getLatestPlanResearch).toHaveBeenCalledWith(
      PLAN_ID,
      expect.anything(),
    );
    const saved = {
      brief: 'Saved brief [S1]',
      sources: [expect.objectContaining({ key: 'S1' })],
    };
    expect(mocks.createGroundedOutlineProvider).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'free', research: saved }),
    );
    expect(mocks.reserveRegenerationQuotaAtProviderStart).toHaveBeenCalledWith(
      expect.objectContaining({ groundedTier: 'free' }),
    );
  });

  it('clears older feedback when the job has no reasons or note', async () => {
    jobSequence(job('pending'), job('pending'), job('processing', RUN_ID));

    await runPlanRegeneration(JOB_ID, groundedContext);

    expect(stages.research.mock.calls[0]?.[0].guidance).toBeNull();
    expect(mocks.updatePlan).toHaveBeenCalledWith({
      regenerationReasons: null,
      regenerationNote: null,
    });
  });

  it('skips quality and feedback when the outline fails', async () => {
    mocks.runGenerationWithReservation.mockResolvedValue({
      status: 'failure',
      classification: 'timeout',
      error: new Error('timeout'),
      durationMs: 1,
    });
    mocks.settleGenerationResult.mockResolvedValue({
      status: 'retryable_failure',
      classification: 'timeout',
      error: new Error('timeout'),
    });

    await expect(
      runPlanRegeneration(JOB_ID, groundedContext),
    ).resolves.toMatchObject({ kind: 'retry-scheduled' });
    expect(stages.outlineQuality).not.toHaveBeenCalled();
    expect(mocks.updatePlan).not.toHaveBeenCalled();
  });

  describe('writer pick (JCS-169)', () => {
    const WRITER_PICK = 'anthropic/claude-haiku-5.5';

    function writerModelOverrides() {
      return {
        provider:
          mocks.createGroundedOutlineProvider.mock.calls[0]?.[0].modelOverride,
        quality: stages.outlineQuality.mock.calls[0]?.[0].modelOverride,
      };
    }

    beforeEach(() => {
      mocks.getGroundedModelPreferences.mockResolvedValue({
        preferredWriterAiModel: WRITER_PICK,
        preferredVerifierAiModel: null,
        preferredAdvisorAiModel: null,
      });
    });

    it('writes and checks the Pro outline with the saved writer pick, not the legacy regeneration pick', async () => {
      await runPlanRegeneration(JOB_ID, groundedContext);

      expect(writerModelOverrides()).toEqual({
        provider: WRITER_PICK,
        quality: WRITER_PICK,
      });
    });

    it('falls back to the tier writers when Pro saved no writer pick', async () => {
      mocks.getGroundedModelPreferences.mockResolvedValue({
        preferredWriterAiModel: null,
        preferredVerifierAiModel: null,
        preferredAdvisorAiModel: null,
      });

      await runPlanRegeneration(JOB_ID, groundedContext);

      expect(writerModelOverrides()).toEqual({
        provider: null,
        quality: null,
      });
    });

    it('falls back to the saved writer pick when the override is off the writer catalog', async () => {
      const withOverride = (row: Job): Job => ({
        ...row,
        data: {
          ...row.data,
          overrides: { model: 'anthropic/claude-opus-5.5' },
        },
      });
      jobSequence(
        withOverride(groundedJob('pending')),
        withOverride(groundedJob('pending')),
        withOverride(groundedJob('processing', RUN_ID)),
      );

      await runPlanRegeneration(JOB_ID, groundedContext);

      expect(writerModelOverrides()).toEqual({
        provider: WRITER_PICK,
        quality: WRITER_PICK,
      });
    });

    it.each(['starter', 'free'] as const)(
      'ignores a %s writer pick and legacy picks in grounded outlines',
      async (tier) => {
        mocks.resolveUserTier.mockResolvedValue(tier);
        mocks.getLatestPlanResearch.mockResolvedValue(SAVED_ROW);

        await runPlanRegeneration(JOB_ID, groundedContext);

        expect(writerModelOverrides()).toEqual({
          provider: null,
          quality: null,
        });
      },
    );
  });

  it("keeps today's flow when the switch is off for the tier", async () => {
    stages.isEnabled.mockReturnValue(false);

    await expect(
      runPlanRegeneration(JOB_ID, groundedContext),
    ).resolves.toMatchObject({ kind: 'completed' });

    expect(mocks.processGenerationAttemptWithReservation).toHaveBeenCalled();
    expect(mocks.getGroundedModelPreferences).not.toHaveBeenCalled();
    expect(mocks.runGenerationWithReservation).not.toHaveBeenCalled();
    expect(stages.research).not.toHaveBeenCalled();
    expect(mocks.updatePlan).not.toHaveBeenCalled();
    expect(
      mocks.createPlanLifecycleService.mock.calls[0]?.[0],
    ).not.toHaveProperty('generationProvider');
    expect(
      mocks.reserveRegenerationQuotaAtProviderStart.mock.calls[0]?.[0],
    ).not.toHaveProperty('groundedTier');
  });

  it('still denies Free when the switch is off', async () => {
    stages.isEnabled.mockReturnValue(false);
    mocks.resolveUserTier.mockResolvedValue('free');

    await expect(
      runPlanRegeneration(JOB_ID, groundedContext),
    ).resolves.toMatchObject({ kind: 'permanent-failure' });
    expect(mocks.reserveAttemptSlot).not.toHaveBeenCalled();
  });
});

describe('terminalizeAbandonedRegenerationRun', () => {
  it('fails a processing job this run still owns', async () => {
    jobSequence(job('processing', RUN_ID));

    await expect(
      terminalizeAbandonedRegenerationRun(JOB_ID, RUN_ID),
    ).resolves.toBe(true);
    expect(mocks.failJob).toHaveBeenCalledWith(
      JOB_ID,
      PLAN_REGENERATION_FAILURE_MESSAGE,
      { retryable: false },
    );
  });

  it.each([
    ['owned by a rival run', job('processing', 'msg-rival')],
    ['never claimed', job('pending')],
  ])('leaves a job %s alone', async (_label, row) => {
    jobSequence(row);

    await expect(
      terminalizeAbandonedRegenerationRun(JOB_ID, RUN_ID),
    ).resolves.toBe(false);
    expect(mocks.failJob).not.toHaveBeenCalled();
  });
});
