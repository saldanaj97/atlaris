import type { PlanLifecycleServicePorts } from '@/features/plans/lifecycle/service';

import { makeAttemptReservation } from '@tests/fixtures/attempts';
import { makeCanonicalUsage } from '@tests/fixtures/canonical-usage.factory';
import { vi } from 'vitest';

export type LifecyclePortOverrides = {
  [K in keyof PlanLifecycleServicePorts]?: Partial<
    PlanLifecycleServicePorts[K]
  >;
};

export function mockFinalizeSuccessRecord(planId: string, attemptId: string) {
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

export function createMockPorts(
  overrides?: LifecyclePortOverrides,
): PlanLifecycleServicePorts {
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
  };
}
