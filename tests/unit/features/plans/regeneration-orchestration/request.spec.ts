import type { MeteredReservationToken } from '@/features/billing/metered-reservation';
import type { RegenerationOrchestrationDeps } from '@/features/plans/regeneration-orchestration/deps';
import type { RegenerationOwnedPlan } from '@/features/plans/regeneration-orchestration/types';

import { runRegenerationQuotaReserved } from '@/features/billing/regeneration-quota-boundary';
import { resetPlanRegenerationCancellationMarkersForTests } from '@/features/plans/cancel-plan-regeneration-workflow';
import { createDefaultRegenerationOrchestrationDeps } from '@/features/plans/regeneration-orchestration/deps';
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

const baseToken: MeteredReservationToken = {
  userId: 'user-1',
  month: '2026-04',
  meter: 'regeneration',
  limit: 5,
  newCount: 3,
};

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function buildDeps(
  overrides: RegenerationOrchestrationDepsOverrides = {},
): RegenerationOrchestrationDeps {
  const tryRegister = vi.fn((getDrainPromise: () => Promise<void>) => {
    void getDrainPromise();
    return true;
  });
  const drain = vi.fn(() => Promise.resolve());

  return makeRegenerationOrchestrationDeps({
    ...overrides,
    dbClient: overrides.dbClient ?? fakeDb,
    queue: { ...overrides.queue },
    quota: {
      runReserved: vi.fn(async (args) => {
        const workResult = await args.work();
        if (workResult.disposition === 'consumed') {
          return {
            ok: true as const,
            consumed: true as const,
            value: workResult.value,
          };
        }
        return {
          ok: true as const,
          consumed: false as const,
          value: workResult.value,
          reconciliationRequired: false as const,
        };
      }) as RegenerationOrchestrationDeps['quota']['runReserved'],
      ...overrides.quota,
    },
    plans: {
      getActiveRegenerationJob: vi.fn(async () => null),
      findOwnedPlan: vi.fn(async () => ownedPlan),
      ...overrides.plans,
    },
    inlineDrain: {
      tryRegister,
      drain,
      ...overrides.inlineDrain,
    },
  });
}

describe('requestPlanRegeneration', () => {
  it('uses injected inlineDrain when building default deps', () => {
    const drain = vi.fn(async () => undefined);
    const deps = createDefaultRegenerationOrchestrationDeps(fakeDb, {
      inlineDrain: drain,
    });

    expect(deps.inlineDrain.drain).toBe(drain);
  });

  it('returns queue-disabled when queue is off', async () => {
    const deps = buildDeps({
      queue: { enabled: () => false },
    });
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
        inlineProcessingEnabled: true,
      },
      deps,
    );
    expect(result).toEqual({ kind: 'queue-disabled' });
    expect(deps.plans.findOwnedPlan).not.toHaveBeenCalled();
  });

  it('returns enqueued with inlineDrainScheduled true when lock acquired', async () => {
    const deps = buildDeps();
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
        inlineProcessingEnabled: true,
      },
      deps,
    );
    expect(result).toMatchObject({
      kind: 'enqueued',
      jobId: 'job-1',
      inlineDrainScheduled: true,
    });
    expect(deps.inlineDrain.tryRegister).toHaveBeenCalledTimes(1);
  });

  it('logs and continues when inline drain throws synchronously', async () => {
    const drainError = new Error('sync drain boom');
    let registeredPromise: Promise<void> | undefined;
    const deps = buildDeps({
      inlineDrain: {
        tryRegister: vi.fn((getDrainPromise: () => Promise<void>) => {
          registeredPromise = getDrainPromise();
          return true;
        }),
        drain: vi.fn(() => {
          throw drainError;
        }),
      },
    });

    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
        inlineProcessingEnabled: true,
      },
      deps,
    );

    expect(result).toMatchObject({
      kind: 'enqueued',
      inlineDrainScheduled: true,
    });
    await registeredPromise;
    expect(deps.logger.error).toHaveBeenCalledWith(
      {
        planId: ownedPlan.id,
        userId: 'user-1',
        error: drainError,
        inlineProcessingEnabled: true,
        drainFn: 'drainRegenerationQueue',
      },
      'Inline regeneration queue drain failed',
    );
  });

  it('registers a promise that tracks async inline drain completion', async () => {
    const drain = deferred();
    let registeredPromise: Promise<void> | undefined;
    const deps = buildDeps({
      inlineDrain: {
        tryRegister: vi.fn((getDrainPromise: () => Promise<void>) => {
          registeredPromise = getDrainPromise();
          return true;
        }),
        drain: vi.fn(() => drain.promise),
      },
    });

    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
        inlineProcessingEnabled: true,
      },
      deps,
    );

    expect(result).toMatchObject({
      kind: 'enqueued',
      inlineDrainScheduled: true,
    });
    expect(registeredPromise).toBeDefined();

    let settled = false;
    void registeredPromise?.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    drain.resolve();
    await registeredPromise;
    expect(settled).toBe(true);
  });

  it('returns enqueued with inlineDrainScheduled false when inlineProcessingEnabled is false', async () => {
    const deps = buildDeps();
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
        inlineProcessingEnabled: false,
      },
      deps,
    );
    expect(result).toMatchObject({
      kind: 'enqueued',
      inlineDrainScheduled: false,
    });
    expect(deps.inlineDrain.tryRegister).not.toHaveBeenCalled();
  });

  it('returns enqueued with inlineDrainScheduled false when lock not acquired', async () => {
    const drain = vi.fn(() => Promise.resolve());
    const tryRegister = vi.fn(() => false);
    const deps = buildDeps({
      inlineDrain: {
        tryRegister,
        drain,
      },
    });
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
        inlineProcessingEnabled: true,
      },
      deps,
    );
    expect(result).toMatchObject({
      kind: 'enqueued',
      inlineDrainScheduled: false,
    });
    expect(tryRegister).toHaveBeenCalledTimes(1);
    expect(drain).not.toHaveBeenCalled();
  });

  it('returns active-job-conflict without enqueue or quota', async () => {
    const base = buildDeps();
    const deps = buildDeps({
      plans: {
        ...base.plans,
        getActiveRegenerationJob: vi.fn(async () => ({ id: 'existing' })),
      },
    });
    const runReserved = deps.quota.runReserved as ReturnType<typeof vi.fn>;
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
        inlineProcessingEnabled: false,
      },
      deps,
    );
    expect(result).toEqual({
      kind: 'active-job-conflict',
      existingJobId: 'existing',
    });
    expect(runReserved).not.toHaveBeenCalled();
    expect(deps.queue.enqueueWithResult).not.toHaveBeenCalled();
  });

  it('maps queue dedupe to queue-dedupe-conflict and calls compensate once', async () => {
    const compensate = vi.fn().mockResolvedValue(undefined);
    const reportReconciliation = vi.fn();
    const deps = buildDeps({
      queue: {
        enqueueWithResult: vi.fn(async () => ({
          id: 'dup-job',
          deduplicated: true,
        })),
      },
      quota: {
        runReserved: ((
          args: Parameters<typeof runRegenerationQuotaReserved>[0],
        ) =>
          runRegenerationQuotaReserved(args, {
            reserve: vi.fn().mockResolvedValue({
              ok: true,
              token: baseToken,
            }),
            compensate,
            reportReconciliation,
          })) as RegenerationOrchestrationDeps['quota']['runReserved'],
      },
    });

    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
        inlineProcessingEnabled: false,
      },
      deps,
    );

    expect(result).toEqual({
      kind: 'queue-dedupe-conflict',
      existingJobId: 'dup-job',
    });
    expect(compensate).toHaveBeenCalledTimes(1);
    expect(reportReconciliation).not.toHaveBeenCalled();
  });

  it('compensates once when enqueue throws after quota reserve, without reconciliation report', async () => {
    const enqueueError = new Error('enqueue failed');
    const compensate = vi.fn().mockResolvedValue(undefined);
    const reportReconciliation = vi.fn();
    const deps = buildDeps({
      queue: {
        enqueueWithResult: vi.fn().mockRejectedValue(enqueueError),
      },
      quota: {
        runReserved: ((
          args: Parameters<typeof runRegenerationQuotaReserved>[0],
        ) =>
          runRegenerationQuotaReserved(args, {
            reserve: vi.fn().mockResolvedValue({
              ok: true,
              token: baseToken,
            }),
            compensate,
            reportReconciliation,
          })) as RegenerationOrchestrationDeps['quota']['runReserved'],
      },
    });

    await expect(
      requestPlanRegeneration(
        {
          userId: 'user-1',
          planId: ownedPlan.id,
          inlineProcessingEnabled: false,
        },
        deps,
      ),
    ).rejects.toBe(enqueueError);

    expect(compensate).toHaveBeenCalledTimes(1);
    expect(compensate).toHaveBeenCalledWith(baseToken, fakeDb);
    expect(reportReconciliation).not.toHaveBeenCalled();
  });

  it('returns quota-denied when reservation fails', async () => {
    const deps = buildDeps({
      quota: {
        runReserved: vi.fn().mockResolvedValue({
          ok: false as const,
          currentCount: 5,
          limit: 5,
        }),
      },
    });
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
        inlineProcessingEnabled: false,
      },
      deps,
    );
    expect(result).toEqual({
      kind: 'quota-denied',
      currentCount: 5,
      limit: 5,
      reason: 'Regeneration quota exceeded for your subscription tier.',
    });
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
        inlineProcessingEnabled: false,
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
          inlineProcessingEnabled: false,
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
      vi.stubEnv('PLAN_REGENERATION_WORKFLOW_ENABLED', 'true');
      startPlanRegenerationWorkflowMock.mockReset();
      cancelPlanRegenerationWorkflowMock.mockReset();
      cancelPlanRegenerationWorkflowMock.mockResolvedValue(true);
      recordRegenerationWorkflowAttachUncertainMock.mockReset();
      startPlanRegenerationWorkflowMock.mockResolvedValue({
        started: true,
        runId: 'wrun_enqueue',
      });
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('starts workflow once, persists runId, and skips inline drain', async () => {
      const updateRegenerationJobPayload = vi.fn(async () => null);
      const deps = buildDeps({
        queue: { updateRegenerationJobPayload },
      });

      const result = await requestPlanRegeneration(
        {
          userId: 'user-1',
          planId: ownedPlan.id,
          inlineProcessingEnabled: true,
        },
        deps,
      );

      expect(result).toMatchObject({
        kind: 'enqueued',
        jobId: 'job-1',
        inlineDrainScheduled: false,
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
      expect(deps.inlineDrain.tryRegister).not.toHaveBeenCalled();
    });

    it('marks workflow start failure retryable without compensating quota', async () => {
      startPlanRegenerationWorkflowMock.mockResolvedValue({ started: false });
      const failJob = vi.fn(async () => null);
      const runReserved = vi.fn(async (args) => {
        const workResult = await args.work();
        if (workResult.disposition === 'consumed') {
          return {
            ok: true as const,
            consumed: true as const,
            value: workResult.value,
          };
        }
        return {
          ok: true as const,
          consumed: false as const,
          value: workResult.value,
          reconciliationRequired: false as const,
        };
      });
      const deps = buildDeps({
        queue: { failJob },
        quota: { runReserved },
      });

      const result = await requestPlanRegeneration(
        {
          userId: 'user-1',
          planId: ownedPlan.id,
          inlineProcessingEnabled: false,
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
      expect(runReserved).toHaveBeenCalledTimes(1);
    });

    it('does not compensate quota when workflow start fails at enqueue time', async () => {
      startPlanRegenerationWorkflowMock.mockResolvedValue({ started: false });
      const failJob = vi.fn(async () => null);
      const reserve = vi.fn().mockResolvedValue({
        ok: true,
        token: baseToken,
      });
      const compensate = vi.fn(async () => undefined);
      const deps = buildDeps({
        queue: { failJob },
        quota: {
          runReserved: ((
            args: Parameters<typeof runRegenerationQuotaReserved>[0],
          ) =>
            runRegenerationQuotaReserved(args, {
              reserve,
              compensate,
              reportReconciliation: vi.fn(),
            })) as RegenerationOrchestrationDeps['quota']['runReserved'],
        },
      });

      const result = await requestPlanRegeneration(
        {
          userId: 'user-1',
          planId: ownedPlan.id,
          inlineProcessingEnabled: false,
        },
        deps,
      );

      expect(result).toMatchObject({
        kind: 'workflow-start-failed',
        retryable: true,
      });
      expect(reserve).toHaveBeenCalledTimes(1);
      expect(compensate).not.toHaveBeenCalled();
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
          inlineProcessingEnabled: false,
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
          inlineProcessingEnabled: false,
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

    it('does not compensate when workflow attach throws unexpectedly', async () => {
      const workflowError = new Error('unexpected attach failure');
      startPlanRegenerationWorkflowMock.mockRejectedValue(workflowError);
      const failJob = vi.fn(async () => null);
      const compensate = vi.fn(async () => undefined);
      const deps = buildDeps({
        queue: { failJob },
        quota: {
          runReserved: ((
            args: Parameters<typeof runRegenerationQuotaReserved>[0],
          ) =>
            runRegenerationQuotaReserved(args, {
              reserve: vi.fn().mockResolvedValue({
                ok: true,
                token: baseToken,
              }),
              compensate,
              reportReconciliation: vi.fn(),
            })) as RegenerationOrchestrationDeps['quota']['runReserved'],
        },
      });

      await expect(
        requestPlanRegeneration(
          {
            userId: 'user-1',
            planId: ownedPlan.id,
            inlineProcessingEnabled: false,
          },
          deps,
        ),
      ).rejects.toThrow('unexpected attach failure');

      expect(failJob).toHaveBeenCalledWith(
        'job-1',
        'Failed to attach plan regeneration workflow.',
        { retryable: false },
      );
      expect(compensate).not.toHaveBeenCalled();
    });
  });

  it('registers guarded drain promise that absorbs rejection', async () => {
    let registeredPromise: Promise<void> | undefined;
    const deps = buildDeps({
      inlineDrain: {
        tryRegister: (fn: () => Promise<void>) => {
          registeredPromise = fn();
          return true;
        },
        drain: () => Promise.reject(new Error('drain boom')),
      },
    });
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
        inlineProcessingEnabled: true,
      },
      deps,
    );
    expect(result.kind).toBe('enqueued');
    await registeredPromise;
    expect(deps.logger.error).toHaveBeenCalled();
  });
});
