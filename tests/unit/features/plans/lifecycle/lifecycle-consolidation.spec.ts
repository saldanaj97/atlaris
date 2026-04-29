/**
 * Lifecycle Consolidation Tests — verifies that PlanLifecycleService is the
 * single authoritative owner of create, generate, retry, and regenerate
 * for all entry points with consistent behavior.
 *
 * Covers:
 * - Generation input parity (optional fields forwarded through the same lifecycle)
 * - modelOverride forwarding
 * - One lifecycle record per generation attempt
 * - Failed generations produce consistent state regardless of entry point
 * - Retry and regeneration inputs handled identically by processGenerationAttempt
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlanLifecycleServicePorts } from '@/features/plans/lifecycle/service';
import { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { ProcessGenerationInput } from '@/features/plans/lifecycle/types';
import { makeAttemptReservation } from '@tests/fixtures/attempts';

import { makeCanonicalUsage } from '../../../../fixtures/canonical-usage.factory';

// ─── Helpers ─────────────────────────────────────────────────────

type PortOverrides = {
  [K in keyof PlanLifecycleServicePorts]?: Partial<
    PlanLifecycleServicePorts[K]
  >;
};

function mockFinalizeSuccessRecord(planId: string, attemptId: string) {
  return {
    id: attemptId,
    planId,
    status: 'success' as const,
    classification: null,
    durationMs: 1500,
    modulesCount: 1,
    tasksCount: 0,
    truncatedTopic: false,
    truncatedNotes: false,
    normalizedEffort: false,
    promptHash: 'ph',
    metadata: null,
    createdAt: new Date(),
  };
}

function createMockPorts(overrides?: PortOverrides): PlanLifecycleServicePorts {
  const defaults = {
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
      runGeneration: vi.fn().mockImplementation(async (params) => {
        const planId = params.planId as string;
        const reservation = makeAttemptReservation({
          attemptId: `attempt-${planId}`,
        });
        return {
          status: 'success' as const,
          modules: [{ title: 'Module 1', estimatedMinutes: 60, tasks: [] }],
          metadata: { provider: 'openai', model: 'gpt-4o' },
          usage: makeCanonicalUsage(),
          durationMs: 1500,
          reservation,
          extendedTimeout: false,
        };
      }),
    },
    generationFinalization: {
      finalizeSuccess: vi
        .fn()
        .mockImplementation(
          async (input: { planId: string; attemptId: string }) =>
            mockFinalizeSuccessRecord(input.planId, input.attemptId),
        ),
      finalizeFailure: vi.fn().mockResolvedValue(undefined),
    },
    jobQueue: {
      enqueueJob: async () => 'job-123',
      completeJob: async () => {},
      failJob: async () => {},
    },
  };

  return {
    planPersistence: {
      ...defaults.planPersistence,
      ...overrides?.planPersistence,
    },
    quota: { ...defaults.quota, ...overrides?.quota },
    generation: { ...defaults.generation, ...overrides?.generation },
    generationFinalization: {
      ...defaults.generationFinalization,
      ...overrides?.generationFinalization,
    },
    jobQueue: { ...defaults.jobQueue, ...overrides?.jobQueue },
  };
}

// ─── Inputs simulating different entry points ────────────────────

/** Simulates stream route building a generation input (initial creation). */
const STREAM_INPUT: ProcessGenerationInput = {
  planId: 'plan-stream-001',
  userId: 'user-001',
  tier: 'free',
  input: {
    topic: 'Learn TypeScript',
    skillLevel: 'beginner',
    weeklyHours: 5,
    learningStyle: 'mixed',
    startDate: '2025-01-01',
    deadlineDate: '2025-03-01',
    notes: 'Focus on generics',
  },
  modelOverride: 'gpt-4o',
};

/** Simulates retry route building a generation input from existing plan data. */
const RETRY_INPUT: ProcessGenerationInput = {
  planId: 'plan-retry-002',
  userId: 'user-001',
  tier: 'free',
  input: {
    topic: 'Learn TypeScript',
    skillLevel: 'beginner',
    weeklyHours: 5,
    learningStyle: 'mixed',
    startDate: '2025-01-01',
    deadlineDate: '2025-03-01',
  },
};

/** Simulates regeneration worker building input with overrides. */
const REGENERATION_INPUT: ProcessGenerationInput = {
  planId: 'plan-regen-003',
  userId: 'user-001',
  tier: 'pro',
  input: {
    topic: 'Advanced TypeScript',
    skillLevel: 'intermediate',
    weeklyHours: 10,
    learningStyle: 'practice',
    startDate: '2025-02-01',
    deadlineDate: '2025-06-01',
    notes: 'Include design patterns',
  },
};

// ─── Tests ───────────────────────────────────────────────────────

describe('Lifecycle Consolidation', () => {
  let service: PlanLifecycleService;
  let ports: PlanLifecycleServicePorts;

  beforeEach(() => {
    ports = createMockPorts();
    service = new PlanLifecycleService(ports);
  });

  // ─── Model override forwarding ──────────────────────────────

  describe('modelOverride forwarding', () => {
    it('forwards modelOverride to generation port', async () => {
      await service.processGenerationAttempt(STREAM_INPUT);
      const runGeneration = vi.mocked(ports.generation.runGeneration);

      expect(runGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          modelOverride: 'gpt-4o',
        }),
      );
    });

    it('omits modelOverride when not provided (retry/regeneration default)', async () => {
      await service.processGenerationAttempt(RETRY_INPUT);
      const runGeneration = vi.mocked(ports.generation.runGeneration);

      expect(runGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          modelOverride: undefined,
        }),
      );
    });
  });

  // ─── One lifecycle record per attempt ───────────────────────

  describe('one lifecycle record per generation attempt', () => {
    it('calls generation port exactly once for stream input', async () => {
      const runGeneration = vi.mocked(ports.generation.runGeneration);
      await service.processGenerationAttempt(STREAM_INPUT);
      expect(runGeneration).toHaveBeenCalledTimes(1);
    });

    it('calls generation port exactly once for retry input', async () => {
      const runGeneration = vi.mocked(ports.generation.runGeneration);
      await service.processGenerationAttempt(RETRY_INPUT);
      expect(runGeneration).toHaveBeenCalledTimes(1);
    });

    it('calls generation port exactly once for regeneration input', async () => {
      const runGeneration = vi.mocked(ports.generation.runGeneration);
      await service.processGenerationAttempt(REGENERATION_INPUT);
      expect(runGeneration).toHaveBeenCalledTimes(1);
    });

    it('calls generationFinalization.finalizeSuccess exactly once on successful generation', async () => {
      const finalizeSuccess = vi.mocked(
        ports.generationFinalization.finalizeSuccess,
      );

      await service.processGenerationAttempt(STREAM_INPUT);
      expect(finalizeSuccess).toHaveBeenCalledTimes(1);
    });

    it('calls generationFinalization.finalizeFailure exactly once on failed generation', async () => {
      const resv = makeAttemptReservation({ attemptId: 'fail-1' });
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

      const finalizeFailure = vi.mocked(
        ports.generationFinalization.finalizeFailure,
      );

      await service.processGenerationAttempt(RETRY_INPUT);
      expect(finalizeFailure).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Consistent failed state ────────────────────────────────

  describe('failed generations end in clear, consistent state', () => {
    it.each([
      {
        classification: 'provider_error' as const,
        expectedStatus: 'retryable_failure',
      },
      {
        classification: 'timeout' as const,
        expectedStatus: 'retryable_failure',
      },
      {
        classification: 'rate_limit' as const,
        expectedStatus: 'retryable_failure',
      },
      {
        classification: 'conflict' as const,
        expectedStatus: 'retryable_failure',
      },
      {
        classification: 'validation' as const,
        expectedStatus: 'permanent_failure',
      },
      {
        classification: 'capped' as const,
        expectedStatus: 'permanent_failure',
      },
    ])(
      '$classification → $expectedStatus with plan marked failed',
      async ({ classification, expectedStatus }) => {
        const resv = makeAttemptReservation({
          attemptId: `att-${classification}`,
        });
        ports = createMockPorts({
          generation: {
            runGeneration: vi.fn().mockResolvedValue({
              status: 'failure',
              classification,
              error: new Error(`${classification} error`),
              durationMs: 100,
              reservation: resv,
              timedOut: classification === 'timeout',
              extendedTimeout: false,
              ...(expectedStatus === 'permanent_failure'
                ? { usage: makeCanonicalUsage() }
                : {}),
            }),
          },
        });
        service = new PlanLifecycleService(ports);

        const result = await service.processGenerationAttempt(STREAM_INPUT);
        expect(result.status).toBe(expectedStatus);

        const finalizeFailure = vi.mocked(
          ports.generationFinalization.finalizeFailure,
        );
        expect(finalizeFailure).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: 'reserved_attempt',
            planId: STREAM_INPUT.planId,
          }),
        );
      },
    );

    it('always includes classification and error on failure result', async () => {
      const resv = makeAttemptReservation();
      ports = createMockPorts({
        generation: {
          runGeneration: vi.fn().mockResolvedValue({
            status: 'failure',
            classification: 'provider_error',
            error: new Error('something went wrong'),
            durationMs: 200,
            reservation: resv,
            timedOut: false,
            extendedTimeout: false,
          }),
        },
      });
      service = new PlanLifecycleService(ports);

      const result = await service.processGenerationAttempt(RETRY_INPUT);

      expect(result.status).toBe('retryable_failure');
      if (
        result.status === 'retryable_failure' ||
        result.status === 'permanent_failure'
      ) {
        expect(result.classification).toBe('provider_error');
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe('something went wrong');
      }
    });
  });

  // ─── Lifecycle consistency across entry points ──────────────

  describe('lifecycle consistency across stream, retry, and regeneration', () => {
    it('processes stream, retry, and regeneration inputs identically through the same path', async () => {
      const runGeneration = vi.mocked(ports.generation.runGeneration);

      const streamResult = await service.processGenerationAttempt(STREAM_INPUT);
      const retryResult = await service.processGenerationAttempt(RETRY_INPUT);
      const regenResult =
        await service.processGenerationAttempt(REGENERATION_INPUT);

      // All three should succeed via the same lifecycle path
      expect(streamResult.status).toBe('generation_success');
      expect(retryResult.status).toBe('generation_success');
      expect(regenResult.status).toBe('generation_success');

      // All three called the same generation port
      expect(runGeneration).toHaveBeenCalledTimes(3);

      const finalizeSuccess = vi.mocked(
        ports.generationFinalization.finalizeSuccess,
      );
      expect(finalizeSuccess).toHaveBeenCalledTimes(3);
      expect(finalizeSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ planId: 'plan-stream-001' }),
      );
      expect(finalizeSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ planId: 'plan-retry-002' }),
      );
      expect(finalizeSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ planId: 'plan-regen-003' }),
      );
    });

    it('handles failure consistently for all entry points', async () => {
      const resv = makeAttemptReservation({ attemptId: 'shared-fail' });
      ports = createMockPorts({
        generation: {
          runGeneration: vi.fn().mockResolvedValue({
            status: 'failure',
            classification: 'provider_error',
            error: new Error('service unavailable'),
            durationMs: 300,
            reservation: resv,
            timedOut: false,
            extendedTimeout: false,
          }),
        },
      });
      service = new PlanLifecycleService(ports);

      const results = await Promise.all([
        service.processGenerationAttempt(STREAM_INPUT),
        service.processGenerationAttempt(RETRY_INPUT),
        service.processGenerationAttempt(REGENERATION_INPUT),
      ]);

      // All three should be retryable_failure
      for (const result of results) {
        expect(result.status).toBe('retryable_failure');
        if (result.status === 'retryable_failure') {
          expect(result.classification).toBe('provider_error');
        }
      }

      const finalizeFailure = vi.mocked(
        ports.generationFinalization.finalizeFailure,
      );
      expect(finalizeFailure).toHaveBeenCalledTimes(3);

      const recordSuccess = vi.mocked(
        ports.generationFinalization.finalizeSuccess,
      );
      expect(recordSuccess).not.toHaveBeenCalled();
    });
  });

  // ─── Plan creation lifecycle consistency ────────────────────

  describe('plan creation lifecycle consistency', () => {
    it('creates AI-origin plans through the lifecycle service', async () => {
      const result = await service.createPlan({
        userId: 'user-001',
        topic: 'Learn Rust',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
      });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.planId).toBe('plan-123');
        expect(result.tier).toBe('free');
      }
    });

    it('AI plan creation checks capped plans', async () => {
      const findCapped = vi.fn().mockResolvedValue('capped-plan-id');
      ports = createMockPorts({
        planPersistence: { findCappedPlanWithoutModules: findCapped },
      });
      service = new PlanLifecycleService(ports);

      const aiResult = await service.createPlan({
        userId: 'user-001',
        topic: 'Learn Rust',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
      });

      expect(aiResult.status).toBe('attempt_cap_exceeded');
      expect(findCapped).toHaveBeenCalledTimes(1);
    });
  });
});
