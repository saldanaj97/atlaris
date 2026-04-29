import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlanLifecycleServicePorts } from '@/features/plans/lifecycle/service';
import { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { ProcessGenerationInput } from '@/features/plans/lifecycle/types';
import { makeAttemptReservation } from '@tests/fixtures/attempts';
import { isRetryableClassification } from '@/shared/types/failure-classification';

import { makeCanonicalUsage } from '../../../../fixtures/canonical-usage.factory';

const defaultReservation = makeAttemptReservation();

function mockSuccessAttemptReturn(planId: string) {
  return {
    id: defaultReservation.attemptId,
    planId,
    status: 'success' as const,
    classification: null,
    durationMs: 1500,
    modulesCount: 1,
    tasksCount: 0,
    truncatedTopic: false,
    truncatedNotes: false,
    normalizedEffort: false,
    promptHash: defaultReservation.promptHash,
    metadata: null,
    createdAt: new Date(),
  };
}

function createMockPorts(
  overrides?: Partial<PlanLifecycleServicePorts>,
): PlanLifecycleServicePorts {
  const reservation = defaultReservation;
  return {
    planPersistence: {
      atomicInsertPlan: async () => ({
        success: true as const,
        id: 'plan-123',
      }),
      findCappedPlanWithoutModules: async () => null,
      findRecentDuplicatePlan: async () => null,
      markGenerationSuccess: vi.fn().mockResolvedValue(undefined),
      markGenerationFailure: vi.fn().mockResolvedValue(undefined),
    },
    quota: {
      resolveUserTier: async () => 'free' as const,
      checkDurationCap: () => ({ allowed: true }),
      normalizePlanDuration: () => ({
        startDate: '2025-01-01',
        deadlineDate: '2025-01-15',
        totalWeeks: 2,
      }),
    },
    generation: {
      runGeneration: vi.fn().mockResolvedValue({
        status: 'success' as const,
        modules: [{ title: 'Module 1', estimatedMinutes: 60, tasks: [] }],
        metadata: {
          provider: 'openai',
          model: 'gpt-4o',
          usage: { inputTokens: 100, outputTokens: 200 },
        },
        usage: makeCanonicalUsage(),
        durationMs: 1500,
        reservation,
        extendedTimeout: false,
      }),
    },
    generationFinalization: {
      finalizeSuccess: vi
        .fn()
        .mockResolvedValue(mockSuccessAttemptReturn('plan-gen-001')),
      finalizeFailure: vi.fn().mockResolvedValue(undefined),
    },
    jobQueue: {
      enqueueJob: async () => 'job-123',
      completeJob: async () => {},
      failJob: async () => {},
    },
    ...overrides,
  };
}

const validGenerationInput: ProcessGenerationInput = {
  planId: 'plan-gen-001',
  userId: 'user-abc',
  tier: 'free',
  input: {
    topic: 'Learn TypeScript',
    skillLevel: 'beginner',
    weeklyHours: 5,
    learningStyle: 'mixed',
  },
};

// ─── Tests ───────────────────────────────────────────────────────

describe('PlanLifecycleService.processGenerationAttempt', () => {
  let service: PlanLifecycleService;
  let ports: PlanLifecycleServicePorts;

  beforeEach(() => {
    ports = createMockPorts();
    service = new PlanLifecycleService(ports);
  });

  // ─── Success path ────────────────────────────────────────────

  it('finalizes success in one generationFinalization call with usage kind plan', async () => {
    const result = await service.processGenerationAttempt(validGenerationInput);
    const finalizeSuccess = vi.mocked(
      ports.generationFinalization.finalizeSuccess,
    );

    expect(result.status).toBe('generation_success');
    if (result.status === 'generation_success') {
      expect(result.data.modules).toEqual([
        { title: 'Module 1', estimatedMinutes: 60, tasks: [] },
      ]);
      expect(result.data.metadata).toMatchObject({
        provider: 'openai',
        model: 'gpt-4o',
      });
      expect(result.data.durationMs).toBe(1500);
    }

    expect(finalizeSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: 'plan-gen-001',
        userId: 'user-abc',
        usageKind: 'plan',
        usage: expect.objectContaining({
          provider: 'openai',
          model: 'gpt-4o',
        }),
        preparation: defaultReservation,
        extendedTimeout: false,
      }),
    );
  });

  it('does not mark plan as failed on success', async () => {
    await service.processGenerationAttempt(validGenerationInput);
    const finalizeFailure = vi.mocked(
      ports.generationFinalization.finalizeFailure,
    );

    expect(finalizeFailure).not.toHaveBeenCalled();
  });

  it('propagates when generationFinalization.finalizeSuccess throws', async () => {
    ports = createMockPorts({
      generationFinalization: {
        finalizeSuccess: vi
          .fn()
          .mockRejectedValue(new Error('finalize infra failed')),
        finalizeFailure: vi.fn().mockResolvedValue(undefined),
      },
    });
    service = new PlanLifecycleService(ports);

    await expect(
      service.processGenerationAttempt(validGenerationInput),
    ).rejects.toThrow('finalize infra failed');
  });

  // ─── Retryable failure path ──────────────────────────────────

  it.each(['provider_error', 'timeout', 'rate_limit', 'conflict'] as const)(
    'returns retryable_failure for %s classification',
    async (classification) => {
      const resv = makeAttemptReservation({
        attemptId: `att-${classification}`,
      });
      ports = createMockPorts({
        generation: {
          runGeneration: vi.fn().mockResolvedValue({
            status: 'failure',
            classification,
            error: new Error(`${classification} occurred`),
            durationMs: 500,
            reservation: resv,
            timedOut: classification === 'timeout',
            extendedTimeout: false,
          }),
        },
      });
      service = new PlanLifecycleService(ports);

      const result =
        await service.processGenerationAttempt(validGenerationInput);

      expect(result.status).toBe('retryable_failure');
      if (result.status === 'retryable_failure') {
        expect(result.classification).toBe(classification);
        expect(result.error.message).toContain(classification);
      }
    },
  );

  it('finalizes retryable failure (plan failed, no usage) when attempt was reserved', async () => {
    const resv = makeAttemptReservation();
    ports = createMockPorts({
      generation: {
        runGeneration: vi.fn().mockResolvedValue({
          status: 'failure',
          classification: 'provider_error',
          error: new Error('provider down'),
          durationMs: 300,
          reservation: resv,
          timedOut: false,
          extendedTimeout: false,
        }),
      },
    });
    service = new PlanLifecycleService(ports);

    await service.processGenerationAttempt(validGenerationInput);
    const finalizeFailure = vi.mocked(
      ports.generationFinalization.finalizeFailure,
    );

    expect(finalizeFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'reserved_attempt',
        planId: 'plan-gen-001',
        userId: 'user-abc',
        retryable: true,
        preparation: resv,
      }),
    );
  });

  it('does NOT record usage on retryable failure', async () => {
    const resv = makeAttemptReservation();
    ports = createMockPorts({
      generation: {
        runGeneration: vi.fn().mockResolvedValue({
          status: 'failure',
          classification: 'timeout',
          error: new Error('timed out'),
          durationMs: 30000,
          reservation: resv,
          timedOut: true,
          extendedTimeout: false,
        }),
      },
    });
    service = new PlanLifecycleService(ports);

    await service.processGenerationAttempt(validGenerationInput);
    const finalizeFailure = vi.mocked(
      ports.generationFinalization.finalizeFailure,
    );

    expect(finalizeFailure).toHaveBeenCalledWith(
      expect.objectContaining({ retryable: true, usageKind: 'plan' }),
    );
    const call = finalizeFailure.mock.calls[0]?.[0];
    expect(call && 'usage' in call ? call.usage : undefined).toBeUndefined();
  });

  // ─── Permanent failure path ──────────────────────────────────

  it.each(['validation', 'capped'] as const)(
    'returns permanent_failure for %s classification',
    async (classification) => {
      const resv = makeAttemptReservation();
      ports = createMockPorts({
        generation: {
          runGeneration: vi.fn().mockResolvedValue({
            status: 'failure',
            classification,
            error: new Error(`${classification} error`),
            metadata: {
              provider: 'openai',
              model: 'gpt-4o',
              usage: { inputTokens: 50, outputTokens: 0 },
            },
            usage: makeCanonicalUsage({
              inputTokens: 50,
              outputTokens: 0,
              totalTokens: 50,
            }),
            durationMs: 200,
            reservation: resv,
            timedOut: false,
            extendedTimeout: false,
          }),
        },
      });
      service = new PlanLifecycleService(ports);

      const result =
        await service.processGenerationAttempt(validGenerationInput);

      expect(result.status).toBe('permanent_failure');
      if (result.status === 'permanent_failure') {
        expect(result.classification).toBe(classification);
        expect(result.error.message).toContain(classification);
      }
    },
  );

  it('finalizes permanent failure when attempt was reserved', async () => {
    const resv = makeAttemptReservation();
    ports = createMockPorts({
      generation: {
        runGeneration: vi.fn().mockResolvedValue({
          status: 'failure',
          classification: 'validation',
          error: new Error('invalid input'),
          durationMs: 100,
          reservation: resv,
          timedOut: false,
          extendedTimeout: false,
        }),
      },
    });
    service = new PlanLifecycleService(ports);

    await service.processGenerationAttempt(validGenerationInput);
    const finalizeFailure = vi.mocked(
      ports.generationFinalization.finalizeFailure,
    );

    expect(finalizeFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'reserved_attempt',
        retryable: false,
        planId: 'plan-gen-001',
      }),
    );
  });

  it('records usage on permanent failure via finalizeFailure', async () => {
    const resv = makeAttemptReservation();
    const usage = makeCanonicalUsage({
      inputTokens: 80,
      outputTokens: 10,
      totalTokens: 90,
      provider: 'anthropic',
      model: 'claude-3',
    });
    ports = createMockPorts({
      generation: {
        runGeneration: vi.fn().mockResolvedValue({
          status: 'failure',
          classification: 'capped',
          error: new Error('attempt limit reached'),
          metadata: {
            provider: 'anthropic',
            model: 'claude-3',
            usage: { inputTokens: 80, outputTokens: 10 },
          },
          usage,
          durationMs: 150,
          reservation: resv,
          timedOut: false,
          extendedTimeout: false,
        }),
      },
    });
    service = new PlanLifecycleService(ports);

    await service.processGenerationAttempt(validGenerationInput);
    const finalizeFailure = vi.mocked(
      ports.generationFinalization.finalizeFailure,
    );

    expect(finalizeFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-abc',
        usage: expect.objectContaining({
          provider: 'anthropic',
          model: 'claude-3',
        }),
        usageKind: 'plan',
        retryable: false,
      }),
    );
  });

  // ─── Input forwarding ────────────────────────────────────────

  it('forwards planId, userId, tier, input and signal to the generation port', async () => {
    const signal = new AbortController().signal;
    const input: ProcessGenerationInput = {
      ...validGenerationInput,
      tier: 'pro',
      signal,
    };

    await service.processGenerationAttempt(input);
    const runGeneration = vi.mocked(ports.generation.runGeneration);

    expect(runGeneration).toHaveBeenCalledWith({
      planId: 'plan-gen-001',
      userId: 'user-abc',
      tier: 'pro',
      input: validGenerationInput.input,
      signal,
    });
  });

  it('forwards allowedGenerationStatuses and onAttemptReserved to the generation port', async () => {
    const onAttemptReserved = vi.fn();
    const signal = new AbortController().signal;
    const input: ProcessGenerationInput = {
      ...validGenerationInput,
      tier: 'pro',
      signal,
      allowedGenerationStatuses: ['failed', 'pending_retry'] as const,
      onAttemptReserved,
    };

    await service.processGenerationAttempt(input);
    const runGeneration = vi.mocked(ports.generation.runGeneration);

    expect(runGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: 'plan-gen-001',
        userId: 'user-abc',
        tier: 'pro',
        input: validGenerationInput.input,
        signal,
        allowedGenerationStatuses: ['failed', 'pending_retry'],
        onAttemptReserved,
      }),
    );
  });

  it('does not finalize failure when generation fails with in_progress reservation rejection', async () => {
    ports = createMockPorts({
      generation: {
        runGeneration: vi.fn().mockResolvedValue({
          status: 'failure',
          classification: 'rate_limit',
          error: new Error('concurrent'),
          durationMs: 1,
          reservationRejectionReason: 'in_progress',
          timedOut: false,
          extendedTimeout: false,
        }),
      },
    });
    service = new PlanLifecycleService(ports);

    const result = await service.processGenerationAttempt(validGenerationInput);

    expect(result.status).toBe('retryable_failure');
    expect(
      vi.mocked(ports.generationFinalization.finalizeFailure),
    ).not.toHaveBeenCalled();
  });

  it('does not finalize failure when generation fails with invalid_status reservation rejection', async () => {
    ports = createMockPorts({
      generation: {
        runGeneration: vi.fn().mockResolvedValue({
          status: 'failure',
          classification: 'validation',
          error: new Error('bad status'),
          durationMs: 1,
          reservationRejectionReason: 'invalid_status',
          timedOut: false,
          extendedTimeout: false,
        }),
      },
    });
    service = new PlanLifecycleService(ports);

    const result = await service.processGenerationAttempt(validGenerationInput);

    expect(result.status).toBe('permanent_failure');
    expect(
      vi.mocked(ports.generationFinalization.finalizeFailure),
    ).not.toHaveBeenCalled();
  });

  it('plan_only finalization when generation fails with rate_limited reservation rejection', async () => {
    ports = createMockPorts({
      generation: {
        runGeneration: vi.fn().mockResolvedValue({
          status: 'failure',
          classification: 'rate_limit',
          error: new Error('rate limited'),
          durationMs: 1,
          reservationRejectionReason: 'rate_limited',
          timedOut: false,
          extendedTimeout: false,
        }),
      },
    });
    service = new PlanLifecycleService(ports);

    await service.processGenerationAttempt(validGenerationInput);

    expect(
      vi.mocked(ports.generationFinalization.finalizeFailure),
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'plan_only',
        planId: 'plan-gen-001',
        userId: 'user-abc',
      }),
    );
  });

  it('plan_only finalization when generation fails with capped reservation rejection', async () => {
    ports = createMockPorts({
      generation: {
        runGeneration: vi.fn().mockResolvedValue({
          status: 'failure',
          classification: 'capped',
          error: new Error('capped'),
          durationMs: 1,
          reservationRejectionReason: 'capped',
          timedOut: false,
          extendedTimeout: false,
        }),
      },
    });
    service = new PlanLifecycleService(ports);

    const result = await service.processGenerationAttempt(validGenerationInput);

    expect(result.status).toBe('permanent_failure');
    expect(
      vi.mocked(ports.generationFinalization.finalizeFailure),
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'plan_only',
        planId: 'plan-gen-001',
      }),
    );
  });

  // ─── Usage metadata extraction ───────────────────────────────

  it('falls back to "unknown" provider/model when metadata is sparse', async () => {
    ports = createMockPorts({
      generation: {
        runGeneration: vi.fn().mockResolvedValue({
          status: 'success',
          modules: [],
          metadata: {},
          usage: makeCanonicalUsage({
            provider: 'unknown',
            model: 'unknown',
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
          }),
          durationMs: 800,
          reservation: defaultReservation,
          extendedTimeout: false,
        }),
      },
    });
    service = new PlanLifecycleService(ports);

    await service.processGenerationAttempt(validGenerationInput);
    const finalizeSuccess = vi.mocked(
      ports.generationFinalization.finalizeSuccess,
    );

    expect(finalizeSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: expect.objectContaining({
          provider: 'unknown',
          model: 'unknown',
        }),
      }),
    );
  });
});

// ─── isRetryableClassification unit tests ────────────────────────

describe('isRetryableClassification', () => {
  it('treats validation as non-retryable', () => {
    expect(isRetryableClassification('validation')).toBe(false);
  });

  it('treats capped as non-retryable', () => {
    expect(isRetryableClassification('capped')).toBe(false);
  });

  it.each(['provider_error', 'timeout', 'rate_limit', 'conflict'] as const)(
    'treats %s as retryable',
    (classification) => {
      expect(isRetryableClassification(classification)).toBe(true);
    },
  );

  it('treats unknown as retryable', () => {
    expect(isRetryableClassification('unknown')).toBe(true);
  });
});
