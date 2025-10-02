import { describe, expect, it } from 'vitest';

import { ATTEMPT_CAP } from '@/lib/db/queries/attempts';
import { mapDetailToClient } from '@/lib/mappers/detailToClient';
import type { GenerationAttempt, LearningPlanDetail } from '@/lib/types/db';

function createPlanDetail(options: {
  modules?: LearningPlanDetail['plan']['modules'];
  attemptsCount?: number;
  latestAttempt?: GenerationAttempt | null;
  latestJobStatus?: LearningPlanDetail['latestJobStatus'];
}): LearningPlanDetail {
  return {
    plan: {
      id: 'plan-1',
      topic: 'Systems Design',
      skillLevel: 'intermediate',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      userId: 'user-1',
      startDate: null,
      deadlineDate: null,
      modules: options.modules ?? [],
    },
    totalTasks: 0,
    completedTasks: 0,
    latestAttempt: options.latestAttempt ?? null,
    attemptsCount: options.attemptsCount ?? 0,
    latestJobStatus: options.latestJobStatus ?? null,
    latestJobError: null,
  };
}

function createModule(moduleId: string, order: number) {
  return {
    id: moduleId,
    planId: 'plan-1',
    title: `Module ${order}`,
    description: null,
    order,
    estimatedMinutes: 120,
    tasks: [],
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  } satisfies LearningPlanDetail['plan']['modules'][number];
}

function createAttempt(
  overrides: Partial<GenerationAttempt>
): GenerationAttempt {
  return {
    id: overrides.id ?? 'attempt-1',
    planId: 'plan-1',
    status: overrides.status ?? 'failure',
    classification: overrides.classification ?? 'timeout',
    durationMs: overrides.durationMs ?? 10_000,
    modulesCount: overrides.modulesCount ?? 0,
    tasksCount: overrides.tasksCount ?? 0,
    truncatedTopic: overrides.truncatedTopic ?? false,
    truncatedNotes: overrides.truncatedNotes ?? false,
    normalizedEffort: overrides.normalizedEffort ?? false,
    promptHash: overrides.promptHash ?? null,
    metadata: overrides.metadata ?? null,
    createdAt: overrides.createdAt ?? new Date('2024-01-01T00:00:05.000Z'),
  };
}

describe('derived plan status mapping', () => {
  it('returns pending when no modules and attempts below cap', () => {
    const detail = createPlanDetail({ attemptsCount: 2 });
    const client = mapDetailToClient(detail);
    expect(client?.status).toBe('pending');
  });

  it('returns ready when modules exist regardless of attempt count', () => {
    const detail = createPlanDetail({
      modules: [createModule('module-1', 1)],
      attemptsCount: ATTEMPT_CAP,
      latestAttempt: createAttempt({
        status: 'success',
        classification: null,
        modulesCount: 1,
        tasksCount: 3,
      }),
    });
    const client = mapDetailToClient(detail);
    expect(client?.status).toBe('ready');
    expect(client?.modules).toHaveLength(1);
    expect(client?.latestAttempt?.classification).toBeNull();
  });

  it('returns failed when attempt cap reached without modules', () => {
    const detail = createPlanDetail({
      modules: [],
      attemptsCount: ATTEMPT_CAP,
      latestAttempt: createAttempt({
        classification: 'capped',
        status: 'failure',
      }),
      latestJobStatus: 'failed',
    });
    const client = mapDetailToClient(detail);
    expect(client?.status).toBe('failed');
  });

  it('remains failed after additional capped attempts beyond the third', () => {
    const detail = createPlanDetail({
      modules: [],
      attemptsCount: ATTEMPT_CAP + 1,
      latestAttempt: createAttempt({
        id: 'attempt-4',
        classification: 'capped',
        status: 'failure',
      }),
      latestJobStatus: 'failed',
    });
    const client = mapDetailToClient(detail);
    expect(client?.status).toBe('failed');
  });
});
