import { makeDbClient } from '@tests/fixtures/db-mocks';
import { vi } from 'vitest';

import type { RegenerationOrchestrationDeps } from '@/features/plans/regeneration-orchestration/deps';

type MergeableDepsKey = Exclude<
  keyof RegenerationOrchestrationDeps,
  'dbClient'
>;

export type RegenerationOrchestrationDepsOverrides = {
  dbClient?: RegenerationOrchestrationDeps['dbClient'];
} & {
  [K in MergeableDepsKey]?: Partial<RegenerationOrchestrationDeps[K]>;
};

export function makeLifecycleServiceMock(
  processGenerationAttempt: RegenerationOrchestrationDeps['lifecycle']['service']['processGenerationAttempt'] = vi.fn(),
): RegenerationOrchestrationDeps['lifecycle']['service'] {
  return {
    processGenerationAttempt,
  } as unknown as RegenerationOrchestrationDeps['lifecycle']['service'];
}

export function makeRegenerationOrchestrationDeps(
  overrides: RegenerationOrchestrationDepsOverrides = {},
): RegenerationOrchestrationDeps {
  const base: RegenerationOrchestrationDeps = {
    dbClient: makeDbClient(),
    queue: {
      enabled: vi.fn(() => true),
      enqueueWithResult: vi.fn(async () => ({
        id: 'job-1',
        deduplicated: false,
      })),
      getNextJob: vi.fn(),
      completeJob: vi.fn(async () => null),
      failJob: vi.fn(async () => null),
    },
    quota: { runReserved: vi.fn() },
    plans: {
      getActiveRegenerationJob: vi.fn(async () => null),
      findOwnedPlan: vi.fn(async () => null),
    },
    tier: {
      resolveUserTier: vi.fn(async () => 'pro' as const),
    },
    priority: {
      computeJobPriority: vi.fn(() => 7),
      isPriorityTopic: vi.fn(() => false),
    },
    lifecycle: {
      service: makeLifecycleServiceMock(),
    },
    inlineDrain: {
      tryRegister: vi.fn(),
      drain: vi.fn(async () => undefined),
    },
    rateLimit: {
      check: vi.fn(async () => ({
        remaining: 4,
        limit: 10,
        reset: 1_700_000_000,
      })),
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
  };

  return {
    ...base,
    dbClient: overrides.dbClient ?? base.dbClient,
    queue: { ...base.queue, ...overrides.queue },
    quota: { ...base.quota, ...overrides.quota },
    plans: { ...base.plans, ...overrides.plans },
    tier: { ...base.tier, ...overrides.tier },
    priority: { ...base.priority, ...overrides.priority },
    lifecycle: { ...base.lifecycle, ...overrides.lifecycle },
    inlineDrain: { ...base.inlineDrain, ...overrides.inlineDrain },
    rateLimit: { ...base.rateLimit, ...overrides.rateLimit },
    logger: { ...base.logger, ...overrides.logger },
  };
}
