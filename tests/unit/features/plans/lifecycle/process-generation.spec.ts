import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { PlanLifecycleServicePorts } from '@/features/plans/lifecycle/service';
import type { ProcessGenerationInput } from '@/features/plans/lifecycle/types';
import { isRetryableClassification } from '@/features/plans/lifecycle/types';

// ─── Helpers ─────────────────────────────────────────────────────

function createMockPorts(
  overrides?: Partial<PlanLifecycleServicePorts>
): PlanLifecycleServicePorts {
  return {
    planPersistence: {
      atomicInsertPlan: async () => ({
        success: true as const,
        id: 'plan-123',
      }),
      findCappedPlanWithoutModules: async () => null,
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
      reservePdfQuota: async () => ({
        allowed: true as const,
        newCount: 1,
        limit: 3,
      }),
      rollbackPdfQuota: async () => {},
    },
    pdfOrigin: {
      preparePlanInput: async () => ({
        origin: 'pdf' as const,
        extractedContext: null,
        topic: 'test',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        pdfUsageReserved: false,
        pdfProvenance: null,
      }),
      rollbackPdfUsage: async () => {},
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
        durationMs: 1500,
      }),
    },
    usageRecording: {
      recordUsage: vi.fn().mockResolvedValue(undefined),
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

  it('marks plan as ready and records usage on successful generation', async () => {
    const result = await service.processGenerationAttempt(validGenerationInput);

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

    expect(ports.planPersistence.markGenerationSuccess).toHaveBeenCalledWith(
      'plan-gen-001'
    );
    expect(ports.usageRecording.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-abc',
        provider: 'openai',
        model: 'gpt-4o',
        kind: 'plan',
      })
    );
  });

  it('does not mark plan as failed on success', async () => {
    await service.processGenerationAttempt(validGenerationInput);

    expect(ports.planPersistence.markGenerationFailure).not.toHaveBeenCalled();
  });

  // ─── Retryable failure path ──────────────────────────────────

  it.each(['provider_error', 'timeout', 'rate_limit', 'conflict'] as const)(
    'returns retryable_failure for %s classification',
    async (classification) => {
      ports = createMockPorts({
        generation: {
          runGeneration: vi.fn().mockResolvedValue({
            status: 'failure',
            classification,
            error: new Error(`${classification} occurred`),
            durationMs: 500,
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
    }
  );

  it('marks plan as failed on retryable failure', async () => {
    ports = createMockPorts({
      generation: {
        runGeneration: vi.fn().mockResolvedValue({
          status: 'failure',
          classification: 'provider_error',
          error: new Error('provider down'),
          durationMs: 300,
        }),
      },
    });
    service = new PlanLifecycleService(ports);

    await service.processGenerationAttempt(validGenerationInput);

    expect(ports.planPersistence.markGenerationFailure).toHaveBeenCalledWith(
      'plan-gen-001'
    );
  });

  it('does NOT record usage on retryable failure', async () => {
    ports = createMockPorts({
      generation: {
        runGeneration: vi.fn().mockResolvedValue({
          status: 'failure',
          classification: 'timeout',
          error: new Error('timed out'),
          durationMs: 30000,
        }),
      },
    });
    service = new PlanLifecycleService(ports);

    await service.processGenerationAttempt(validGenerationInput);

    expect(ports.usageRecording.recordUsage).not.toHaveBeenCalled();
  });

  // ─── Permanent failure path ──────────────────────────────────

  it.each(['validation', 'capped'] as const)(
    'returns permanent_failure for %s classification',
    async (classification) => {
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
            durationMs: 200,
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
    }
  );

  it('marks plan as failed on permanent failure', async () => {
    ports = createMockPorts({
      generation: {
        runGeneration: vi.fn().mockResolvedValue({
          status: 'failure',
          classification: 'validation',
          error: new Error('invalid input'),
          durationMs: 100,
        }),
      },
    });
    service = new PlanLifecycleService(ports);

    await service.processGenerationAttempt(validGenerationInput);

    expect(ports.planPersistence.markGenerationFailure).toHaveBeenCalledWith(
      'plan-gen-001'
    );
  });

  it('records usage on permanent failure', async () => {
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
          durationMs: 150,
        }),
      },
    });
    service = new PlanLifecycleService(ports);

    await service.processGenerationAttempt(validGenerationInput);

    expect(ports.usageRecording.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-abc',
        provider: 'anthropic',
        model: 'claude-3',
        kind: 'plan',
      })
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

    expect(ports.generation.runGeneration).toHaveBeenCalledWith({
      planId: 'plan-gen-001',
      userId: 'user-abc',
      tier: 'pro',
      input: validGenerationInput.input,
      signal,
    });
  });

  // ─── Usage metadata extraction ───────────────────────────────

  it('falls back to "unknown" provider/model when metadata is sparse', async () => {
    ports = createMockPorts({
      generation: {
        runGeneration: vi.fn().mockResolvedValue({
          status: 'success',
          modules: [],
          metadata: {},
          durationMs: 800,
        }),
      },
    });
    service = new PlanLifecycleService(ports);

    await service.processGenerationAttempt(validGenerationInput);

    expect(ports.usageRecording.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'unknown',
        model: 'unknown',
      })
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
    }
  );

  it('treats unknown as retryable', () => {
    expect(isRetryableClassification('unknown')).toBe(true);
  });
});
