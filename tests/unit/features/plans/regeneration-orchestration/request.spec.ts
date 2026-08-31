import type { RegenerationOrchestrationDeps } from '@/features/plans/regeneration-orchestration/deps';
import type { RegenerationOwnedPlan } from '@/features/plans/regeneration-orchestration/types';

import { resetPlanRegenerationCancellationMarkersForTests } from '@/features/plans/cancel-plan-regeneration-workflow';
import { requestPlanRegeneration } from '@/features/plans/regeneration-orchestration/request';
import { RateLimitError } from '@/lib/api/errors';
import { makeDbClient } from '@tests/fixtures/db-mocks';
import {
  makeRegenerationOrchestrationDeps,
  type RegenerationOrchestrationDepsOverrides,
} from '@tests/helpers/regeneration-orchestration-deps';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const startPlanRegenerationWorkflowMock = vi.hoisted(() => vi.fn());
const cancelPlanRegenerationWorkflowMock = vi.hoisted(() =>
  vi.fn(async () => true),
);
const recordRegenerationWorkflowAttachUncertainMock = vi.hoisted(() => vi.fn());

vi.mock(
  '@/features/plans/start-plan-regeneration-workflow',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/features/plans/start-plan-regeneration-workflow')
      >();
    return {
      ...actual,
      startPlanRegenerationWorkflow: startPlanRegenerationWorkflowMock,
    };
  },
);

vi.mock(
  '@/features/plans/cancel-plan-regeneration-workflow',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/features/plans/cancel-plan-regeneration-workflow')
      >();
    return {
      ...actual,
      cancelPlanRegenerationWorkflow: cancelPlanRegenerationWorkflowMock,
    };
  },
);

vi.mock('@/lib/logging/ops-alerts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/logging/ops-alerts')>();
  return {
    ...actual,
    recordRegenerationWorkflowAttachUncertain:
      recordRegenerationWorkflowAttachUncertainMock,
  };
});

const fakeDb = makeDbClient();

const ownedPlan: RegenerationOwnedPlan = {
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  userId: 'user-1',
  topic: 'rust',
  skillLevel: 'beginner',
  weeklyHours: 5,
  learningStyle: 'mixed',
  startDate: null,
  deadlineDate: null,
};

function buildDeps(
  overrides: RegenerationOrchestrationDepsOverrides = {},
): RegenerationOrchestrationDeps {
  return makeRegenerationOrchestrationDeps({
    ...overrides,
    dbClient: overrides.dbClient ?? fakeDb,
    queue: { ...overrides.queue },
    quota: { ...overrides.quota },
    plans: {
      getActiveRegenerationJob: vi.fn(async () => null),
      findOwnedPlan: vi.fn(async () => ownedPlan),
      ...overrides.plans,
    },
  });
}

describe('requestPlanRegeneration', () => {
  it('returns queue-disabled when queue is off', async () => {
    const deps = buildDeps({
      queue: { enabled: () => false },
    });
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
      },
      deps,
    );
    expect(result).toEqual({ kind: 'queue-disabled' });
    expect(deps.plans.findOwnedPlan).not.toHaveBeenCalled();
  });

  it('returns active-job-conflict without enqueue or quota', async () => {
    const base = buildDeps();
    const deps = buildDeps({
      plans: {
        ...base.plans,
        getActiveRegenerationJob: vi.fn(async () => ({ id: 'existing' })),
      },
    });
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
      },
      deps,
    );
    expect(result).toEqual({
      kind: 'active-job-conflict',
      existingJobId: 'existing',
    });
    expect(deps.quota.peekUsage).not.toHaveBeenCalled();
    expect(deps.queue.enqueueWithResult).not.toHaveBeenCalled();
  });

  it('maps queue dedupe to queue-dedupe-conflict without settling quota', async () => {
    const deps = buildDeps({
      queue: {
        enqueueWithResult: vi.fn(async () => ({
          id: 'dup-job',
          deduplicated: true,
        })),
      },
    });

    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
      },
      deps,
    );

    expect(result).toEqual({
      kind: 'queue-dedupe-conflict',
      existingJobId: 'dup-job',
    });
  });

  it('does not settle quota when enqueue throws', async () => {
    const enqueueError = new Error('enqueue failed');
    const deps = buildDeps({
      queue: {
        enqueueWithResult: vi.fn().mockRejectedValue(enqueueError),
      },
    });

    await expect(
      requestPlanRegeneration(
        {
          userId: 'user-1',
          planId: ownedPlan.id,
        },
        deps,
      ),
    ).rejects.toBe(enqueueError);
  });

  it('returns quota-denied from a non-settling usage peek', async () => {
    const deps = buildDeps({
      quota: {
        peekUsage: vi.fn(async () => ({
          tier: 'starter' as const,
          activePlans: { current: 1, limit: 10 },
          regenerations: { used: 5, limit: 5 },
        })),
      },
    });
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
      },
      deps,
    );
    expect(result).toEqual({
      kind: 'quota-denied',
      currentCount: 5,
      limit: 5,
      reason: 'Regeneration quota exceeded for your subscription tier.',
    });
    expect(deps.queue.enqueueWithResult).not.toHaveBeenCalled();
  });

  it('returns not-included for Free before duration or quota', async () => {
    const deps = buildDeps({
      tier: { resolveUserTier: vi.fn(async () => 'free' as const) },
      quota: {
        peekUsage: vi.fn(async () => ({
          tier: 'free' as const,
          activePlans: { current: 1, limit: 1 },
          regenerations: { used: 0, limit: 0 },
        })),
      },
    });
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
        overrides: { deadlineDate: '2026-12-01' },
      },
      deps,
    );
    expect(result).toEqual({ kind: 'not-included' });
    expect(deps.quota.peekUsage).not.toHaveBeenCalled();
    expect(deps.queue.enqueueWithResult).not.toHaveBeenCalled();
  });

  it('returns duration-exceeded for Starter merged dates over 8 weeks', async () => {
    const longPlan: RegenerationOwnedPlan = {
      ...ownedPlan,
      startDate: '2026-01-01',
      deadlineDate: '2026-04-01',
    };
    const base = buildDeps();
    const deps = buildDeps({
      tier: { resolveUserTier: vi.fn(async () => 'starter' as const) },
      plans: {
        ...base.plans,
        findOwnedPlan: vi.fn(async () => longPlan),
      },
    });
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
      },
      deps,
    );
    expect(result.kind).toBe('duration-exceeded');
    expect(deps.queue.enqueueWithResult).not.toHaveBeenCalled();
  });

  it('enqueues a Starter long plan when date overrides bring duration within cap', async () => {
    startPlanRegenerationWorkflowMock.mockResolvedValue({ started: false });
    const longPlan: RegenerationOwnedPlan = {
      ...ownedPlan,
      startDate: '2026-01-01',
      deadlineDate: '2026-04-01',
    };
    const base = buildDeps();
    const deps = buildDeps({
      tier: { resolveUserTier: vi.fn(async () => 'starter' as const) },
      plans: {
        ...base.plans,
        findOwnedPlan: vi.fn(async () => longPlan),
      },
    });
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
        overrides: { deadlineDate: '2026-02-12' },
      },
      deps,
    );
    expect(result.kind).not.toBe('duration-exceeded');
    expect(result.kind).not.toBe('not-included');
    expect(deps.queue.enqueueWithResult).toHaveBeenCalledWith(
      'plan_regeneration',
      ownedPlan.id,
      'user-1',
      {
        planId: ownedPlan.id,
        overrides: { deadlineDate: '2026-02-12' },
      },
      7,
    );
  });

  it('returns content-locked when the owned plan is not fully accessible', async () => {
    const base = buildDeps();
    const deps = buildDeps({
      plans: {
        ...base.plans,
        readContentAccess: vi.fn(async () => 'locked' as const),
      },
    });
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
      },
      deps,
    );
    expect(result).toEqual({ kind: 'content-locked' });
    expect(deps.queue.enqueueWithResult).not.toHaveBeenCalled();
  });

  it('returns plan-not-found when findOwnedPlan returns null', async () => {
    const base = buildDeps();
    const deps = buildDeps({
      plans: {
        ...base.plans,
        findOwnedPlan: vi.fn(async () => null),
      },
    });
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
      },
      deps,
    );
    expect(result).toEqual({ kind: 'plan-not-found' });
  });

  it('propagates RateLimitError from rate limit check', async () => {
    const deps = buildDeps({
      rateLimit: {
        check: vi.fn().mockRejectedValue(
          new RateLimitError('blocked', {
            retryAfter: 60,
            remaining: 0,
            limit: 3,
            reset: 1,
          }),
        ),
      },
    });
    await expect(
      requestPlanRegeneration(
        {
          userId: 'user-1',
          planId: ownedPlan.id,
        },
        deps,
      ),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof RateLimitError && err.status() === 429,
    );
  });

  describe('workflow-enabled enqueue', () => {
    beforeEach(() => {
      resetPlanRegenerationCancellationMarkersForTests();
      startPlanRegenerationWorkflowMock.mockReset();
      cancelPlanRegenerationWorkflowMock.mockReset();
      cancelPlanRegenerationWorkflowMock.mockResolvedValue(true);
      recordRegenerationWorkflowAttachUncertainMock.mockReset();
      startPlanRegenerationWorkflowMock.mockResolvedValue({
        started: true,
        runId: 'wrun_enqueue',
      });
    });

    afterEach(() => {});

    it('starts workflow once, persists runId, and skips inline drain', async () => {
      const updateRegenerationJobPayload = vi.fn(
        async (
          _jobId: string,
          payload: Parameters<
            RegenerationOrchestrationDeps['queue']['updateRegenerationJobPayload']
          >[1],
        ) =>
          ({
            id: 'job-1',
            data: payload,
          }) as Awaited<
            ReturnType<
              RegenerationOrchestrationDeps['queue']['updateRegenerationJobPayload']
            >
          >,
      );
      const deps = buildDeps({
        queue: { updateRegenerationJobPayload },
      });

      const result = await requestPlanRegeneration(
        {
          userId: 'user-1',
          planId: ownedPlan.id,
        },
        deps,
      );

      expect(result).toMatchObject({
        kind: 'enqueued',
        jobId: 'job-1',
      });
      expect(startPlanRegenerationWorkflowMock).toHaveBeenCalledTimes(1);
      expect(updateRegenerationJobPayload).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({
          planId: ownedPlan.id,
          workflow: expect.objectContaining({
            provider: 'workflow-sdk',
            runId: 'wrun_enqueue',
            startedAt: expect.any(String),
          }),
        }),
      );
    });

    it('persists an optional model override on the queued job payload', async () => {
      const deps = buildDeps();

      await requestPlanRegeneration(
        {
          userId: 'user-1',
          planId: ownedPlan.id,
          overrides: { model: 'google/gemini-3-pro-preview' },
        },
        deps,
      );

      expect(deps.queue.enqueueWithResult).toHaveBeenCalledWith(
        'plan_regeneration',
        ownedPlan.id,
        'user-1',
        {
          planId: ownedPlan.id,
          overrides: { model: 'google/gemini-3-pro-preview' },
        },
        7,
      );
    });

    it('marks workflow start failure retryable without settling quota', async () => {
      startPlanRegenerationWorkflowMock.mockResolvedValue({ started: false });
      const failJob = vi.fn(async () => null);
      const deps = buildDeps({
        queue: { failJob },
      });

      const result = await requestPlanRegeneration(
        {
          userId: 'user-1',
          planId: ownedPlan.id,
        },
        deps,
      );

      expect(result).toMatchObject({
        kind: 'workflow-start-failed',
        jobId: 'job-1',
        planId: ownedPlan.id,
        retryable: true,
      });
      expect(failJob).toHaveBeenCalledWith(
        'job-1',
        'Failed to start plan regeneration workflow.',
        { retryable: true },
      );
    });

    it('marks persist failure non-retryable and emits ops telemetry when cancel fails', async () => {
      cancelPlanRegenerationWorkflowMock.mockResolvedValue(false);
      const persistError = new Error('runId persist failed');
      const updateRegenerationJobPayload = vi.fn(async () => {
        throw persistError;
      });
      const failJob = vi.fn(async () => null);
      const deps = buildDeps({
        queue: { failJob, updateRegenerationJobPayload },
      });

      const result = await requestPlanRegeneration(
        {
          userId: 'user-1',
          planId: ownedPlan.id,
        },
        deps,
      );

      expect(result).toMatchObject({
        kind: 'workflow-start-failed',
        jobId: 'job-1',
        planId: ownedPlan.id,
        retryable: false,
      });
      expect(failJob).toHaveBeenCalledWith(
        'job-1',
        'Failed to persist plan regeneration workflow run id.',
        { retryable: false },
      );
      expect(failJob).toHaveBeenCalledTimes(1);
      expect(
        recordRegenerationWorkflowAttachUncertainMock,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-1',
          planId: ownedPlan.id,
          userId: 'user-1',
          workflowRunId: 'wrun_enqueue',
          cancellationSucceeded: false,
        }),
        persistError,
      );
    });

    it('does not settle quota when a started workflow is canceled after run id persistence fails', async () => {
      const persistError = new Error('runId persist failed');
      const updateRegenerationJobPayload = vi.fn(async () => {
        throw persistError;
      });
      const failJob = vi.fn(async () => null);
      const deps = buildDeps({
        queue: { failJob, updateRegenerationJobPayload },
      });

      const result = await requestPlanRegeneration(
        {
          userId: 'user-1',
          planId: ownedPlan.id,
        },
        deps,
      );

      expect(result).toMatchObject({
        kind: 'workflow-start-failed',
        jobId: 'job-1',
        planId: ownedPlan.id,
        retryable: false,
      });
      expect(failJob).toHaveBeenCalledWith(
        'job-1',
        'Failed to persist plan regeneration workflow run id.',
        { retryable: false },
      );
      expect(
        recordRegenerationWorkflowAttachUncertainMock,
      ).not.toHaveBeenCalled();
    });

    it('returns a structured persist failure when job terminalization fails', async () => {
      const persistError = new Error('runId persist failed');
      const updateRegenerationJobPayload = vi.fn(async () => {
        throw persistError;
      });
      const failJob = vi.fn(async () => {
        throw new Error('database unavailable');
      });
      const deps = buildDeps({
        queue: { failJob, updateRegenerationJobPayload },
      });

      const result = await requestPlanRegeneration(
        {
          userId: 'user-1',
          planId: ownedPlan.id,
        },
        deps,
      );

      expect(result).toMatchObject({
        kind: 'workflow-start-failed',
        jobId: 'job-1',
        planId: ownedPlan.id,
        retryable: false,
      });
      expect(failJob).toHaveBeenCalledTimes(1);
    });

    it('does not settle quota when workflow attach throws unexpectedly', async () => {
      const workflowError = new Error('unexpected attach failure');
      startPlanRegenerationWorkflowMock.mockRejectedValue(workflowError);
      const failJob = vi.fn(async () => null);
      const deps = buildDeps({
        queue: { failJob },
      });

      await expect(
        requestPlanRegeneration(
          {
            userId: 'user-1',
            planId: ownedPlan.id,
          },
          deps,
        ),
      ).rejects.toThrow('unexpected attach failure');

      expect(failJob).toHaveBeenCalledWith(
        'job-1',
        'Failed to attach plan regeneration workflow.',
        { retryable: false },
      );
      expect(
        recordRegenerationWorkflowAttachUncertainMock,
      ).toHaveBeenCalledWith(
        {
          jobId: 'job-1',
          planId: ownedPlan.id,
          userId: 'user-1',
          correlationId: 'regen-job-1',
        },
        workflowError,
      );
    });
  });
});
