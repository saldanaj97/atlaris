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

vi.mock('@/lib/observability/metrics', () => ({
  countMetric: vi.fn(),
  distributionMetric: vi.fn(),
}));

import type { PlanLifecycleServicePorts } from '@/features/plans/lifecycle/service';
import type { ProcessGenerationInput } from '@/features/plans/lifecycle/types';

import { createMockPorts } from './lifecycle-test-helpers';
import { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import { countMetric, distributionMetric } from '@/lib/observability/metrics';
import { makeAttemptReservation } from '@tests/fixtures/attempts';

// ─── Inputs simulating different entry points ────────────────────

/** Simulates stream route building a generation input (initial creation). */
const STREAM_INPUT: ProcessGenerationInput = {
  planId: 'plan-stream-001',
  userId: 'user-001',
  tier: 'free',
  generationPurpose: 'initial',
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
  generationPurpose: 'initial',
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
  generationPurpose: 'regeneration',
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
    vi.clearAllMocks();
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

      const [callArg] = runGeneration.mock.calls[0] ?? [];
      expect(callArg).toBeDefined();
      expect(callArg).not.toHaveProperty('modelOverride');
    });
  });

  describe('generation purpose classification', () => {
    it('classifies stream and retry as initial and regeneration as regeneration', async () => {
      await service.processGenerationAttempt(STREAM_INPUT);
      await service.processGenerationAttempt(RETRY_INPUT);
      await service.processGenerationAttempt(REGENERATION_INPUT);

      const runGeneration = vi.mocked(ports.generation.runGeneration);
      expect(runGeneration.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ generationPurpose: 'initial' }),
      );
      expect(runGeneration.mock.calls[1]?.[0]).toEqual(
        expect.objectContaining({ generationPurpose: 'initial' }),
      );
      expect(runGeneration.mock.calls[2]?.[0]).toEqual(
        expect.objectContaining({ generationPurpose: 'regeneration' }),
      );
    });
  });

  // ─── Generation metrics ─────────────────────────────────────

  describe('generation metrics', () => {
    it('emits success and duration metrics after successful generation', async () => {
      await service.processGenerationAttempt(STREAM_INPUT);

      expect(countMetric).toHaveBeenCalledWith(
        'atlaris.plan.generation.success',
        1,
        {
          attributes: {
            tier: STREAM_INPUT.tier,
            generation_purpose: 'initial',
            extended_timeout: false,
          },
        },
      );
      expect(distributionMetric).toHaveBeenCalledWith(
        'atlaris.plan.generation.duration_ms',
        1500,
        {
          unit: 'millisecond',
          attributes: {
            status: 'success',
            tier: STREAM_INPUT.tier,
            generation_purpose: 'initial',
            extended_timeout: false,
          },
        },
      );
    });

    it('emits failure and duration metrics after failed generation', async () => {
      const resv = makeAttemptReservation({ attemptId: 'metric-fail-1' });
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

      await service.processGenerationAttempt(RETRY_INPUT);

      expect(countMetric).toHaveBeenCalledWith(
        'atlaris.plan.generation.failure',
        1,
        {
          attributes: {
            classification: 'timeout',
            retryable: true,
            tier: RETRY_INPUT.tier,
            generation_purpose: 'initial',
          },
        },
      );
      expect(distributionMetric).toHaveBeenCalledWith(
        'atlaris.plan.generation.duration_ms',
        30000,
        {
          unit: 'millisecond',
          attributes: {
            status: 'failure',
            classification: 'timeout',
            retryable: true,
            tier: RETRY_INPUT.tier,
            generation_purpose: 'initial',
          },
        },
      );
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
    it('emits the plan-created metric for AI-origin plans', async () => {
      await service.createPlan({
        userId: 'user-001',
        topic: 'Learn Rust',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
      });

      expect(countMetric).toHaveBeenCalledWith('atlaris.plan.created', 1, {
        attributes: {
          origin: 'ai',
          tier: 'free',
        },
      });
    });
  });
});
