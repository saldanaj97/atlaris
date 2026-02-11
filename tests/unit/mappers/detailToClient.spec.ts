/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { ATTEMPT_CAP } from '@/lib/db/queries/attempts';
import {
  mapAttemptsToClient,
  mapDetailToClient,
} from '@/lib/mappers/detailToClient';
import type {
  LearningPlan,
  LearningPlanDetail,
  Module,
  Task,
  TaskProgress,
  TaskResourceWithResource,
} from '@/lib/types/db';
import { describe, expect, it } from 'vitest';
import {
  buildModule,
  buildPlan,
  buildPlanDetail,
  buildSuccessAttempt,
  buildTask,
  buildTaskResource,
} from '../../fixtures/plan-detail';

describe('mapDetailToClient', () => {
  it('should map complete plan detail to client format', () => {
    const plan = {
      id: 'plan-1',
      userId: 'user-1',
      topic: 'TypeScript',
      skillLevel: 'intermediate',
      weeklyHours: 10,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      startDate: '2024-01-01',
      deadlineDate: '2024-03-01',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    const module1: Module = {
      id: 'module-1',
      planId: 'plan-1',
      order: 1,
      title: 'Basics',
      description: 'Introduction',
      estimatedMinutes: 120,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    const task1: Task & {
      resources: TaskResourceWithResource[];
      progress: TaskProgress | null;
    } = {
      id: 'task-1',
      moduleId: 'module-1',
      order: 1,
      title: 'Learn basics',
      description: 'Basic concepts',
      estimatedMinutes: 60,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      resources: [
        {
          id: 'task-resource-1',
          taskId: 'task-1',
          resourceId: 'resource-1',
          order: 1,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          resource: {
            id: 'resource-1',
            type: 'article',
            title: 'TS Handbook',
            url: 'https://example.com',
            durationMinutes: 30,
            createdAt: new Date('2024-01-01'),
          },
        },
      ],
      progress: {
        id: 'progress-1',
        taskId: 'task-1',
        userId: 'user-1',
        status: 'completed',
        completedAt: new Date('2024-01-02'),
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      },
    };

    const latestAttempt = {
      id: 'attempt-1',
      generationId: 'gen-1',
      attemptNumber: 1,
      status: 'success',
      classification: null,
      durationMs: 5000,
      modulesCount: 5,
      tasksCount: 20,
      truncatedTopic: false,
      truncatedNotes: false,
      normalizedEffort: false,
      promptHash: 'hash123',
      metadata: { provider: { model: 'gpt-4' } },
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    const detail: LearningPlanDetail = {
      plan: {
        ...plan,
        modules: [
          {
            ...module1,
            tasks: [task1],
          },
        ],
      },
      totalTasks: 1,
      completedTasks: 1,
      latestAttempt,
      attemptsCount: 1,
    };

    const result = mapDetailToClient(detail);

    expect(result).toBeDefined();
    expect(result!.id).toBe('plan-1');
    expect(result!.topic).toBe('TypeScript');
    expect(result!.skillLevel).toBe('intermediate');
    expect(result!.modules).toHaveLength(1);
    expect(result!.modules[0].title).toBe('Basics');
    expect(result!.modules[0].tasks).toHaveLength(1);
    expect(result!.modules[0].tasks[0].title).toBe('Learn basics');
    expect(result!.modules[0].tasks[0].status).toBe('completed');
    expect(result!.modules[0].tasks[0].resources).toHaveLength(1);
    expect(result!.status).toBe('ready');
    expect(result!.latestAttempt).toBeDefined();
    expect(result!.latestAttempt!.model).toBe('gpt-4');
  });

  it('should return undefined for null detail', () => {
    const result = mapDetailToClient(null as unknown as LearningPlanDetail);
    expect(result).toBeUndefined();
  });

  it('should return undefined for undefined detail', () => {
    const result = mapDetailToClient(
      undefined as unknown as LearningPlanDetail
    );
    expect(result).toBeUndefined();
  });

  it('should return undefined if plan is missing', () => {
    const detail = {
      plan: null,
      totalTasks: 0,
      completedTasks: 0,
      latestAttempt: null,
      attemptsCount: 0,
    } as unknown as LearningPlanDetail;

    const result = mapDetailToClient(detail);
    expect(result).toBeUndefined();
  });

  it('should handle null descriptions', () => {
    const plan = {
      id: 'plan-1',
      userId: 'user-1',
      topic: 'Test',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      startDate: '2024-01-01',
      deadlineDate: '2024-03-01',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    const module1: Module = {
      id: 'module-1',
      planId: 'plan-1',
      order: 1,
      title: 'Module',
      description: null,
      estimatedMinutes: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    const task1: Task & {
      resources: TaskResourceWithResource[];
      progress: TaskProgress | null;
    } = {
      id: 'task-1',
      moduleId: 'module-1',
      order: 1,
      title: 'Task',
      description: null,
      estimatedMinutes: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      resources: [],
      progress: null,
    };

    const detail: LearningPlanDetail = {
      plan: {
        ...plan,
        modules: [{ ...module1, tasks: [task1] }],
      },
      totalTasks: 1,
      completedTasks: 0,
      latestAttempt: null,
      attemptsCount: 0,
    };

    const result = mapDetailToClient(detail);

    expect(result).toBeDefined();
    expect(result!.modules[0].description).toBeNull();
    expect(result!.modules[0].estimatedMinutes).toBe(0);
    expect(result!.modules[0].tasks[0].description).toBeNull();
    expect(result!.modules[0].tasks[0].estimatedMinutes).toBe(0);
    expect(result!.modules[0].tasks[0].status).toBe('not_started');
  });

  it('should sort modules and tasks by order', () => {
    const plan = {
      id: 'plan-1',
      userId: 'user-1',
      topic: 'Test',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      startDate: '2024-01-01',
      deadlineDate: '2024-03-01',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    const modules = [
      {
        id: 'module-2',
        planId: 'plan-1',
        order: 2,
        title: 'Second',
        description: null,
        estimatedMinutes: 60,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        tasks: [],
      },
      {
        id: 'module-1',
        planId: 'plan-1',
        order: 1,
        title: 'First',
        description: null,
        estimatedMinutes: 60,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        tasks: [
          {
            id: 'task-2',
            moduleId: 'module-1',
            order: 2,
            title: 'Second Task',
            description: null,
            estimatedMinutes: 30,
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
            resources: [],
            progress: null,
          },
          {
            id: 'task-1',
            moduleId: 'module-1',
            order: 1,
            title: 'First Task',
            description: null,
            estimatedMinutes: 30,
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
            resources: [],
            progress: null,
          },
        ],
      },
    ];

    const detail: LearningPlanDetail = {
      plan: { ...(plan as LearningPlan), modules },
      totalTasks: 2,
      completedTasks: 0,
      latestAttempt: null,
      attemptsCount: 0,
    };

    const result = mapDetailToClient(detail);

    expect(result).toBeDefined();
    expect(result!.modules[0].title).toBe('First');
    expect(result!.modules[1].title).toBe('Second');
    expect(result!.modules[0].tasks[0].title).toBe('First Task');
    expect(result!.modules[0].tasks[1].title).toBe('Second Task');
  });

  it('should derive status as "ready" when modules exist', () => {
    const plan = {
      id: 'plan-1',
      userId: 'user-1',
      topic: 'Test',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      startDate: '2024-01-01',
      deadlineDate: '2024-03-01',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    const detail: LearningPlanDetail = {
      plan: {
        ...plan,
        modules: [
          {
            id: 'module-1',
            planId: 'plan-1',
            order: 1,
            title: 'Module',
            description: null,
            estimatedMinutes: 60,
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
            tasks: [],
          },
        ],
      },
      totalTasks: 0,
      completedTasks: 0,
      latestAttempt: null,
      attemptsCount: 0,
    };

    const result = mapDetailToClient(detail);
    expect(result!.status).toBe('ready');
  });

  it('should derive status as "failed" when plan generation status is failed', () => {
    const plan = {
      id: 'plan-1',
      userId: 'user-1',
      topic: 'Test',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      startDate: '2024-01-01',
      deadlineDate: '2024-03-01',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    const detail: LearningPlanDetail = {
      plan: { ...(plan as any), generationStatus: 'failed', modules: [] },
      totalTasks: 0,
      completedTasks: 0,
      latestAttempt: null,
      attemptsCount: 0,
    };

    const result = mapDetailToClient(detail);
    expect(result!.status).toBe('failed');
  });

  it('should derive status as "failed" when latest attempt is validation failure', () => {
    const plan = {
      id: 'plan-1',
      userId: 'user-1',
      topic: 'Test',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      startDate: '2024-01-01',
      deadlineDate: '2024-03-01',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    const latestAttempt = {
      id: 'attempt-1',
      planId: 'gen-1',
      attemptNumber: 1,
      status: 'failure',
      classification: 'validation',
      durationMs: 1000,
      modulesCount: 0,
      tasksCount: 0,
      truncatedTopic: false,
      truncatedNotes: false,
      normalizedEffort: false,
      promptHash: 'hash',
      metadata: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    const detail: LearningPlanDetail = {
      plan: { ...(plan as any), modules: [] },
      totalTasks: 0,
      completedTasks: 0,
      latestAttempt,
      attemptsCount: 1,
    };

    const result = mapDetailToClient(detail);
    expect(result!.status).toBe('failed');
  });

  it('should derive status as "failed" when attempts count exceeds cap', () => {
    const detail = buildPlanDetail({
      plan: buildPlan({ modules: [] }),
      attemptsCount: ATTEMPT_CAP,
      latestAttempt: null,
    });

    const result = mapDetailToClient(detail);
    expect(result!.status).toBe('failed');
  });

  it('should sort resources within tasks by order', () => {
    const task = buildTask({
      id: 'task-1',
      moduleId: 'module-1',
      order: 1,
      resources: [
        buildTaskResource({
          id: 'resource-2',
          taskId: 'task-1',
          resourceId: 'res-2',
          order: 2,
        }),
        buildTaskResource({
          id: 'resource-1',
          taskId: 'task-1',
          resourceId: 'res-1',
          order: 1,
        }),
      ],
    });

    const detail = buildPlanDetail({
      plan: buildPlan({
        modules: [buildModule({ id: 'module-1', tasks: [task] })],
      }),
    });

    const result = mapDetailToClient(detail);
    expect(result!.modules[0].tasks[0].resources.map((r) => r.order)).toEqual([
      1, 2,
    ]);
  });

  it('should mask classification to null for success attempts', () => {
    const latestAttempt = buildSuccessAttempt({
      status: 'success',
      classification: 'validation',
      metadata: { provider: { model: 'gpt-4o-mini' } },
    });

    const detail = buildPlanDetail({
      plan: buildPlan({ modules: [] }),
      latestAttempt,
      attemptsCount: 1,
    });

    const result = mapDetailToClient(detail);
    expect(result!.latestAttempt!.status).toBe('success');
    expect(result!.latestAttempt!.classification).toBeNull();
    expect(result!.latestAttempt!.model).toBe('gpt-4o-mini');
  });

  it('should derive status as "pending" by default', () => {
    const plan = {
      id: 'plan-1',
      userId: 'user-1',
      topic: 'Test',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      startDate: '2024-01-01',
      deadlineDate: '2024-03-01',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    const detail: LearningPlanDetail = {
      plan: { ...(plan as any), modules: [] },
      totalTasks: 0,
      completedTasks: 0,
      latestAttempt: null,
      attemptsCount: 1,
    };

    const result = mapDetailToClient(detail);
    expect(result!.status).toBe('pending');
  });

  it('should handle null attempt gracefully', () => {
    const plan = {
      id: 'plan-1',
      userId: 'user-1',
      topic: 'Test',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      startDate: '2024-01-01',
      deadlineDate: '2024-03-01',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    const detail: LearningPlanDetail = {
      plan: { ...(plan as any), modules: [] },
      totalTasks: 0,
      completedTasks: 0,
      latestAttempt: null,
      attemptsCount: 0,
    };

    const result = mapDetailToClient(detail);
    expect(result!.latestAttempt).toBeNull();
  });
});

describe('mapAttemptsToClient', () => {
  it('should map array of attempts to client format', () => {
    const attempts = [
      {
        id: 'attempt-1',
        planId: 'gen-1',
        attemptNumber: 1,
        status: 'success',
        classification: null,
        durationMs: 5000,
        modulesCount: 5,
        tasksCount: 20,
        truncatedTopic: false,
        truncatedNotes: false,
        normalizedEffort: false,
        promptHash: 'hash1',
        metadata: { provider: { model: 'gpt-4' } },
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
      {
        id: 'attempt-2',
        planId: 'gen-1',
        attemptNumber: 2,
        status: 'failure',
        classification: 'timeout',
        durationMs: 30000,
        modulesCount: 0,
        tasksCount: 0,
        truncatedTopic: false,
        truncatedNotes: false,
        normalizedEffort: false,
        promptHash: 'hash2',
        metadata: null,
        createdAt: new Date('2024-01-02'),
        updatedAt: new Date('2024-01-02'),
      },
    ];

    const result = mapAttemptsToClient(attempts);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('attempt-1');
    expect(result[0].status).toBe('success');
    expect(result[0].classification).toBeNull();
    expect(result[0].model).toBe('gpt-4');
    expect(result[1].id).toBe('attempt-2');
    expect(result[1].status).toBe('failure');
    expect(result[1].classification).toBe('timeout');
  });

  it('should handle empty array', () => {
    const result = mapAttemptsToClient([]);
    expect(result).toHaveLength(0);
  });

  it('should serialize timestamps to ISO strings and preserve metadata', () => {
    const successAttempt = buildSuccessAttempt({ id: 'attempt-1' });
    const failureAttempt = buildSuccessAttempt({
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
      createdAt: new Date('2025-01-01T00:00:00.000Z').toISOString(),
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

  it('should handle attempts without metadata', () => {
    const attempts = [
      {
        id: 'attempt-1',
        planId: 'gen-1',
        attemptNumber: 1,
        status: 'success',
        classification: null,
        durationMs: 5000,
        modulesCount: 5,
        tasksCount: 20,
        truncatedTopic: false,
        truncatedNotes: false,
        normalizedEffort: false,
        promptHash: null,
        metadata: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    ];

    const result = mapAttemptsToClient(attempts);

    expect(result[0].metadata).toBeNull();
    expect(result[0].model).toBeNull();
    expect(result[0].promptHash).toBeNull();
  });
});
