import { describe, expect, it } from 'vitest';

import { ATTEMPT_CAP } from '@/lib/db/queries/attempts';
import { mapAttemptsToClient, mapDetailToClient } from '@/lib/mappers/detailToClient';
import type {
  GenerationAttempt,
  LearningPlanDetail,
  LearningPlanWithModules,
  ModuleWithTasks,
  TaskResourceWithResource,
  TaskWithRelations,
} from '@/lib/types/db';

const BASE_DATE = new Date('2025-01-01T00:00:00.000Z');

function buildAttempt(overrides: Partial<GenerationAttempt> = {}): GenerationAttempt {
  return {
    id: 'attempt-1',
    planId: 'plan-1',
    status: 'success',
    classification: null,
    durationMs: 1_200,
    modulesCount: 2,
    tasksCount: 4,
    truncatedTopic: false,
    truncatedNotes: false,
    normalizedEffort: false,
    promptHash: 'hash',
    metadata: {
      provider: {
        model: 'gpt-4o',
      },
    },
    createdAt: BASE_DATE,
    ...overrides,
  } satisfies GenerationAttempt;
}

function buildResource(
  overrides: Partial<TaskResourceWithResource> = {}
): TaskResourceWithResource {
  return {
    id: 'task-resource-1',
    taskId: 'task-1',
    resourceId: 'resource-1',
    order: 1,
    notes: null,
    createdAt: BASE_DATE,
    resource: {
      id: 'resource-1',
      type: 'article',
      title: 'Intro to ML',
      url: 'https://example.com/ml',
      domain: 'example.com',
      author: 'Ada Lovelace',
      durationMinutes: 45,
      costCents: null,
      currency: null,
      tags: ['ml'],
      createdAt: BASE_DATE,
    },
    ...overrides,
  } satisfies TaskResourceWithResource;
}

function buildTask(overrides: Partial<TaskWithRelations> = {}): TaskWithRelations {
  return {
    id: 'task-1',
    moduleId: 'module-1',
    order: 1,
    title: 'Read intro article',
    description: 'Basics overview',
    estimatedMinutes: 45,
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
    resources: [buildResource()],
    progress: null,
    ...overrides,
  } satisfies TaskWithRelations;
}

function buildModule(overrides: Partial<ModuleWithTasks> = {}): ModuleWithTasks {
  return {
    id: 'module-1',
    planId: 'plan-1',
    order: 1,
    title: 'Module 1',
    description: 'Getting started',
    estimatedMinutes: 120,
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
    tasks: [buildTask()],
    ...overrides,
  } satisfies ModuleWithTasks;
}

function buildPlan(
  overrides: Partial<LearningPlanWithModules> = {}
): LearningPlanWithModules {
  return {
    id: 'plan-1',
    userId: 'user-1',
    topic: 'Machine Learning Fundamentals',
    skillLevel: 'beginner',
    weeklyHours: 6,
    learningStyle: 'reading',
    startDate: null,
    deadlineDate: null,
    visibility: 'private',
    origin: 'ai',
    generationStatus: 'ready',
    isQuotaEligible: true,
    finalizedAt: BASE_DATE,
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
    modules: [],
    ...overrides,
  } satisfies LearningPlanWithModules;
}

function buildDetail(overrides: Partial<LearningPlanDetail> = {}): LearningPlanDetail {
  return {
    plan: buildPlan(),
    totalTasks: 0,
    completedTasks: 0,
    latestAttempt: null,
    attemptsCount: 0,
     latestJobStatus: null,
     latestJobError: null,
    ...overrides,
  } satisfies LearningPlanDetail;
}

describe('mapDetailToClient', () => {
  it('maps plan detail to client shape with ordering and derived status', () => {
    const moduleA = buildModule({
      id: 'module-a',
      order: 2,
      tasks: [
        buildTask({
          id: 'task-a-2',
          moduleId: 'module-a',
          order: 2,
          resources: [
            buildResource({
              id: 'task-resource-a2',
              taskId: 'task-a-2',
              resourceId: 'resource-a2',
              order: 2,
              resource: {
                id: 'resource-a2',
                type: 'article',
                title: 'Advanced',
                url: 'https://example.com/advanced',
                domain: 'example.com',
                author: 'Alan Turing',
                durationMinutes: 30,
                costCents: null,
                currency: null,
                tags: ['advanced'],
                createdAt: BASE_DATE,
              },
            }),
            buildResource({
              id: 'task-resource-a1',
              taskId: 'task-a-2',
              order: 1,
              resourceId: 'resource-a1',
              resource: {
                id: 'resource-a1',
                type: 'article',
                title: 'Foundations',
                url: 'https://example.com/foundations',
                domain: 'example.com',
                author: 'Grace Hopper',
                durationMinutes: 60,
                costCents: null,
                currency: null,
                tags: ['foundations'],
                createdAt: BASE_DATE,
              },
            }),
          ],
        }),
        buildTask({
          id: 'task-a-1',
          moduleId: 'module-a',
          order: 1,
          title: 'Watch intro video',
          resources: [],
          progress: {
            id: 'progress-1',
            taskId: 'task-a-1',
            userId: 'user-1',
            status: 'completed',
            completedAt: BASE_DATE,
            updatedAt: BASE_DATE,
            createdAt: BASE_DATE,
          },
        }),
      ],
    });

    const moduleB = buildModule({
      id: 'module-b',
      order: 1,
      title: 'Module 0',
      tasks: [
        buildTask({
          id: 'task-b-1',
          moduleId: 'module-b',
          order: 1,
          title: 'Set up dev environment',
          resources: [],
        }),
      ],
    });

    const detail = buildDetail({
      plan: buildPlan({ modules: [moduleA, moduleB] }),
      totalTasks: 3,
      completedTasks: 1,
      latestAttempt: buildAttempt({
        status: 'success',
        classification: 'validation',
        metadata: {
          provider: {
            model: 'gpt-4o-mini',
          },
        },
      }),
      attemptsCount: 1,
    });

    const result = mapDetailToClient(detail);

    expect(result).toBeDefined();
    expect(result?.id).toBe('plan-1');
    expect(result?.status).toBe('ready');
    expect(result?.createdAt).toBe(BASE_DATE.toISOString());
    expect(result?.modules.map((module) => module.id)).toEqual([
      'module-b',
      'module-a',
    ]);
    expect(result?.modules[1]?.tasks.map((task) => task.id)).toEqual([
      'task-a-1',
      'task-a-2',
    ]);
    expect(result?.modules[1]?.tasks[0]?.status).toBe('completed');
    expect(
      result?.modules[1]?.tasks[1]?.resources.map((resource) => resource.order)
    ).toEqual([1, 2]);

    expect(result?.latestAttempt?.status).toBe('success');
    expect(result?.latestAttempt?.classification).toBeNull();
    expect(result?.latestAttempt?.model).toBe('gpt-4o-mini');
    expect(result?.latestAttempt?.metadata).toEqual({
      provider: {
        model: 'gpt-4o-mini',
      },
    });
  });

  it('returns pending status when no modules exist and attempts remain', () => {
    const detail = buildDetail({
      plan: buildPlan({ modules: [] }),
      attemptsCount: 1,
      latestAttempt: null,
    });

    const result = mapDetailToClient(detail);

    expect(result?.status).toBe('pending');
    expect(result?.modules).toHaveLength(0);
    expect(result?.latestAttempt).toBeNull();
  });

  it('returns failed status once attempt cap reached without success', () => {
    const failureAttempt = buildAttempt({
      id: 'attempt-failure',
      status: 'failure',
      classification: 'timeout',
      modulesCount: 0,
      tasksCount: 0,
      metadata: {
        failure: { classification: 'timeout', timed_out: true },
      } as Record<string, unknown>,
    });

    const detail = buildDetail({
      plan: buildPlan({ modules: [] }),
      attemptsCount: ATTEMPT_CAP,
      latestAttempt: failureAttempt,
    });

    const result = mapDetailToClient(detail);

    expect(result?.status).toBe('failed');
    expect(result?.latestAttempt?.status).toBe('failure');
    expect(result?.latestAttempt?.classification).toBe('timeout');
  });
});

describe('mapAttemptsToClient', () => {
  it('maps attempts with serialized timestamps and metadata', () => {
    const successAttempt = buildAttempt();
    const failureAttempt = buildAttempt({
      id: 'attempt-2',
      status: 'failure',
      classification: 'rate_limit',
      truncatedTopic: true,
      truncatedNotes: true,
      normalizedEffort: true,
      metadata: {
        provider: {
          model: 'gpt-4o-mini',
        },
      },
      createdAt: new Date('2025-01-02T00:00:00.000Z'),
    });

    const attempts = mapAttemptsToClient([successAttempt, failureAttempt]);

    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({
      id: 'attempt-1',
      status: 'success',
      classification: null,
      durationMs: 1_200,
      modulesCount: 2,
      tasksCount: 4,
      truncatedTopic: false,
      truncatedNotes: false,
      normalizedEffort: false,
      promptHash: 'hash',
      metadata: {
        provider: {
          model: 'gpt-4o',
        },
      },
      createdAt: BASE_DATE.toISOString(),
    });

    expect(attempts[1]).toMatchObject({
      id: 'attempt-2',
      status: 'failure',
      classification: 'rate_limit',
      truncatedTopic: true,
      truncatedNotes: true,
      normalizedEffort: true,
      metadata: {
        provider: {
          model: 'gpt-4o-mini',
        },
      },
      createdAt: new Date('2025-01-02T00:00:00.000Z').toISOString(),
    });
  });
});
