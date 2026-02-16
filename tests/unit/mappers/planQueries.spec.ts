import type { TaskResourceWithResource } from '@/lib/db/queries/types/modules.types';
import {
  mapLearningPlanDetail,
  mapPlanSummaries,
  type ProgressStatusRow,
  type SummaryTaskRow,
} from '@/lib/mappers/planQueries';
import type {
  GenerationAttempt,
  LearningPlan,
  Module,
  Task,
  TaskProgress,
} from '@/lib/types/db';
import { describe, expect, it } from 'vitest';

import { createId } from '../../fixtures/ids';

function createLearningPlan(
  overrides: Partial<LearningPlan> = {}
): LearningPlan {
  return {
    id: createId('plan'),
    userId: createId('user'),
    topic: 'Test Plan',
    skillLevel: 'beginner',
    weeklyHours: 5,
    learningStyle: 'mixed',
    startDate: '2024-01-01',
    deadlineDate: '2024-03-01',
    visibility: 'private',
    origin: 'ai',
    extractedContext: null,
    generationStatus: 'ready',
    isQuotaEligible: false,
    finalizedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function createModule(overrides: Partial<Module> = {}): Module {
  return {
    id: createId('module'),
    planId: createId('plan'),
    order: 1,
    title: 'Module',
    description: null,
    estimatedMinutes: 60,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: createId('task'),
    moduleId: createId('module'),
    order: 1,
    title: 'Task',
    description: null,
    estimatedMinutes: 60,
    hasMicroExplanation: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function createTaskProgress(
  overrides: Partial<TaskProgress> = {}
): TaskProgress {
  return {
    id: createId('progress'),
    taskId: createId('task'),
    userId: createId('user'),
    status: 'not_started',
    completedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function createSummaryTaskRow(
  overrides: Partial<SummaryTaskRow> = {}
): SummaryTaskRow {
  return {
    id: createId('task'),
    moduleId: createId('module'),
    planId: createId('plan'),
    estimatedMinutes: 60,
    ...overrides,
  };
}

function createTaskResourceWithResource(
  overrides: Partial<TaskResourceWithResource> = {}
): TaskResourceWithResource {
  const resourceId = overrides.resourceId ?? createId('resource');

  return {
    id: createId('task-resource'),
    taskId: createId('task'),
    resourceId,
    order: 1,
    notes: null,
    createdAt: new Date('2024-01-01'),
    resource: {
      id: resourceId,
      type: 'article',
      title: 'TypeScript Handbook',
      url: 'https://example.com/handbook',
      domain: null,
      author: null,
      durationMinutes: null,
      costCents: null,
      currency: null,
      tags: null,
      createdAt: new Date('2024-01-01'),
    },
    ...overrides,
  };
}

function createGenerationAttempt(
  overrides: Partial<GenerationAttempt> = {}
): GenerationAttempt {
  return {
    id: createId('attempt'),
    planId: createId('plan'),
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
    ...overrides,
  };
}

describe('mapPlanSummaries', () => {
  it('should map plans with modules and tasks to summaries', () => {
    const planId = createId('plan');
    const userId = createId('user');
    const moduleId1 = createId('module');
    const moduleId2 = createId('module');
    const taskId1 = createId('task');
    const taskId2 = createId('task');
    const taskId3 = createId('task');

    const planRows: LearningPlan[] = [
      createLearningPlan({
        id: planId,
        userId,
        topic: 'TypeScript Fundamentals',
      }),
    ];

    const moduleRows: Module[] = [
      createModule({
        id: moduleId1,
        planId,
        order: 1,
        title: 'Introduction',
        description: 'Getting started',
        estimatedMinutes: 120,
      }),
      createModule({
        id: moduleId2,
        planId,
        order: 2,
        title: 'Advanced Topics',
        description: 'Deep dive',
        estimatedMinutes: 180,
      }),
    ];

    const taskRows: SummaryTaskRow[] = [
      createSummaryTaskRow({
        id: taskId1,
        moduleId: moduleId1,
        planId,
        estimatedMinutes: 60,
      }),
      createSummaryTaskRow({
        id: taskId2,
        moduleId: moduleId1,
        planId,
        estimatedMinutes: 60,
      }),
      createSummaryTaskRow({
        id: taskId3,
        moduleId: moduleId2,
        planId,
        estimatedMinutes: 90,
      }),
    ];

    const progressRows: ProgressStatusRow[] = [
      { taskId: taskId1, status: 'completed' },
      { taskId: taskId2, status: 'in_progress' },
    ];

    const result = mapPlanSummaries({
      planRows,
      moduleRows,
      taskRows,
      progressRows,
    });

    expect(result).toHaveLength(1);
    expect(result[0].plan.id).toBe(planId);
    expect(result[0].totalTasks).toBe(3);
    expect(result[0].completedTasks).toBe(1);
    expect(result[0].completion).toBeCloseTo(1 / 3);
    expect(result[0].totalMinutes).toBe(210);
    expect(result[0].completedMinutes).toBe(60);
    expect(result[0].modules).toHaveLength(2);
    expect(result[0].completedModules).toBe(0); // None are fully complete
  });

  it('should handle plans with no tasks', () => {
    const planId = createId('plan');
    const userId = createId('user');
    const planRows: LearningPlan[] = [
      createLearningPlan({ id: planId, userId, topic: 'Empty Plan' }),
    ];

    const result = mapPlanSummaries({
      planRows,
      moduleRows: [],
      taskRows: [],
      progressRows: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0].plan.id).toBe(planId);
    expect(result[0].totalTasks).toBe(0);
    expect(result[0].completedTasks).toBe(0);
    expect(result[0].completion).toBe(0);
    expect(result[0].totalMinutes).toBe(0);
    expect(result[0].completedMinutes).toBe(0);
    expect(result[0].modules).toHaveLength(0);
  });

  it('should handle null estimated minutes', () => {
    const planId = createId('plan');
    const userId = createId('user');
    const moduleId = createId('module');
    const taskId = createId('task');
    const planRows: LearningPlan[] = [
      createLearningPlan({ id: planId, userId, topic: 'Test Plan' }),
    ];

    const taskRows: SummaryTaskRow[] = [
      createSummaryTaskRow({
        id: taskId,
        moduleId,
        planId,
        estimatedMinutes: null,
      }),
    ];

    const result = mapPlanSummaries({
      planRows,
      moduleRows: [],
      taskRows,
      progressRows: [],
    });

    expect(result[0].totalMinutes).toBe(0);
    expect(result[0].completedMinutes).toBe(0);
  });

  it('should correctly identify completed modules', () => {
    const planId = createId('plan');
    const userId = createId('user');
    const moduleId1 = createId('module');
    const moduleId2 = createId('module');
    const taskId1 = createId('task');
    const taskId2 = createId('task');
    const taskId3 = createId('task');
    const planRows: LearningPlan[] = [
      createLearningPlan({ id: planId, userId, topic: 'Test Plan' }),
    ];

    const moduleRows: Module[] = [
      createModule({
        id: moduleId1,
        planId,
        order: 1,
        title: 'Module 1',
      }),
      createModule({
        id: moduleId2,
        planId,
        order: 2,
        title: 'Module 2',
      }),
    ];

    const taskRows: SummaryTaskRow[] = [
      createSummaryTaskRow({
        id: taskId1,
        moduleId: moduleId1,
        planId,
        estimatedMinutes: 30,
      }),
      createSummaryTaskRow({
        id: taskId2,
        moduleId: moduleId1,
        planId,
        estimatedMinutes: 30,
      }),
      createSummaryTaskRow({
        id: taskId3,
        moduleId: moduleId2,
        planId,
        estimatedMinutes: 60,
      }),
    ];

    const progressRows: ProgressStatusRow[] = [
      { taskId: taskId1, status: 'completed' },
      { taskId: taskId2, status: 'completed' },
      { taskId: taskId3, status: 'in_progress' },
    ];

    const result = mapPlanSummaries({
      planRows,
      moduleRows,
      taskRows,
      progressRows,
    });

    expect(result[0].completedModules).toBe(1); // Only first module is fully complete
  });

  it('should handle multiple plans', () => {
    const planId1 = createId('plan');
    const planId2 = createId('plan');
    const userId = createId('user');
    const taskId1 = createId('task');
    const taskId2 = createId('task');
    const planRows: LearningPlan[] = [
      createLearningPlan({
        id: planId1,
        userId,
        topic: 'Plan 1',
      }),
      createLearningPlan({
        id: planId2,
        userId,
        topic: 'Plan 2',
        skillLevel: 'intermediate',
        weeklyHours: 10,
        learningStyle: 'reading',
        origin: 'manual',
        startDate: '2024-02-01',
        deadlineDate: '2024-04-01',
        createdAt: new Date('2024-02-01'),
        updatedAt: new Date('2024-02-01'),
      }),
    ];

    const taskRows: SummaryTaskRow[] = [
      createSummaryTaskRow({
        id: taskId1,
        moduleId: createId('module'),
        planId: planId1,
        estimatedMinutes: 60,
      }),
      createSummaryTaskRow({
        id: taskId2,
        moduleId: createId('module'),
        planId: planId2,
        estimatedMinutes: 90,
      }),
    ];

    const result = mapPlanSummaries({
      planRows,
      moduleRows: [],
      taskRows,
      progressRows: [],
    });

    expect(result).toHaveLength(2);
    expect(result[0].plan.id).toBe(planId1);
    expect(result[0].totalTasks).toBe(1);
    expect(result[1].plan.id).toBe(planId2);
    expect(result[1].totalTasks).toBe(1);
  });
});

describe('mapLearningPlanDetail', () => {
  it('should map complete plan detail with all relationships', () => {
    const planId = createId('plan');
    const userId = createId('user');
    const moduleId = createId('module');
    const taskId = createId('task');
    const progressId = createId('progress');
    const taskResourceId = createId('task-resource');
    const resourceId = createId('resource');
    const attemptId = createId('attempt');
    const plan = createLearningPlan({
      id: planId,
      userId,
      topic: 'TypeScript',
      skillLevel: 'intermediate',
      weeklyHours: 10,
    });

    const moduleRows: Module[] = [
      createModule({
        id: moduleId,
        planId,
        order: 1,
        title: 'Introduction',
        description: 'Getting started',
        estimatedMinutes: 120,
      }),
    ];

    const taskRows: Task[] = [
      createTask({
        id: taskId,
        moduleId,
        order: 1,
        title: 'Learn basics',
        description: 'Basic concepts',
        estimatedMinutes: 60,
      }),
    ];

    const progressRows: TaskProgress[] = [
      createTaskProgress({
        id: progressId,
        taskId,
        userId,
        status: 'completed',
        completedAt: new Date('2024-01-02'),
        updatedAt: new Date('2024-01-02'),
      }),
    ];

    const resourceRows: TaskResourceWithResource[] = [
      createTaskResourceWithResource({
        id: taskResourceId,
        taskId,
        resourceId,
        order: 1,
        resource: {
          id: resourceId,
          type: 'article',
          title: 'TypeScript Handbook',
          url: 'https://example.com/handbook',
          domain: null,
          author: null,
          durationMinutes: 30,
          costCents: null,
          currency: null,
          tags: null,
          createdAt: new Date('2024-01-01'),
        },
      }),
    ];

    const latestAttempt: GenerationAttempt = createGenerationAttempt({
      id: attemptId,
      planId,
      promptHash: 'hash123',
    });

    const result = mapLearningPlanDetail({
      plan,
      moduleRows,
      taskRows,
      progressRows,
      resourceRows,
      latestAttempt,
      attemptsCount: 1,
    });

    expect(result.plan.id).toBe(planId);
    expect(result.plan.modules).toHaveLength(1);
    expect(result.plan.modules[0].tasks).toHaveLength(1);
    expect(result.plan.modules[0].tasks[0].resources).toHaveLength(1);
    expect(result.plan.modules[0].tasks[0].progress?.status).toBe('completed');
    expect(result.totalTasks).toBe(1);
    expect(result.completedTasks).toBe(1);
    expect(result.latestAttempt).toEqual(latestAttempt);
    expect(result.attemptsCount).toBe(1);
  });

  it('should handle null progress gracefully', () => {
    const planId = createId('plan');
    const userId = createId('user');
    const moduleId = createId('module');
    const taskId = createId('task');
    const plan = createLearningPlan({ id: planId, userId, topic: 'Test' });

    const moduleRows: Module[] = [
      createModule({
        id: moduleId,
        planId,
        order: 1,
        title: 'Module',
        estimatedMinutes: 60,
      }),
    ];

    const taskRows: Task[] = [
      createTask({
        id: taskId,
        moduleId,
        order: 1,
        title: 'Task',
        estimatedMinutes: 60,
      }),
    ];

    const result = mapLearningPlanDetail({
      plan,
      moduleRows,
      taskRows,
      progressRows: [],
      resourceRows: [],
      latestAttempt: null,
      attemptsCount: 0,
    });

    expect(result.plan.modules[0].tasks[0].progress).toBeNull();
    expect(result.totalTasks).toBe(1);
    expect(result.completedTasks).toBe(0);
  });

  it('should handle empty modules and tasks', () => {
    const planId = createId('plan');
    const userId = createId('user');
    const plan = createLearningPlan({
      id: planId,
      userId,
      topic: 'Empty Plan',
    });

    const result = mapLearningPlanDetail({
      plan,
      moduleRows: [],
      taskRows: [],
      progressRows: [],
      resourceRows: [],
      latestAttempt: null,
      attemptsCount: 0,
    });

    expect(result.plan.id).toBe(planId);
    expect(result.plan.modules).toHaveLength(0);
    expect(result.totalTasks).toBe(0);
    expect(result.completedTasks).toBe(0);
  });

  it('should handle multiple modules with multiple tasks each', () => {
    const planId = createId('plan');
    const userId = createId('user');
    const moduleId1 = createId('module');
    const moduleId2 = createId('module');
    const taskId1 = createId('task');
    const taskId2 = createId('task');
    const taskId3 = createId('task');
    const progressId = createId('progress');
    const plan = createLearningPlan({
      id: planId,
      userId,
      topic: 'Complex Plan',
      skillLevel: 'advanced',
      weeklyHours: 15,
      deadlineDate: '2024-06-01',
    });

    const moduleRows: Module[] = [
      createModule({
        id: moduleId1,
        planId,
        order: 1,
        title: 'Module 1',
        estimatedMinutes: 120,
      }),
      createModule({
        id: moduleId2,
        planId,
        order: 2,
        title: 'Module 2',
        estimatedMinutes: 180,
      }),
    ];

    const taskRows: Task[] = [
      createTask({
        id: taskId1,
        moduleId: moduleId1,
        order: 1,
        title: 'Task 1-1',
        estimatedMinutes: 60,
      }),
      createTask({
        id: taskId2,
        moduleId: moduleId1,
        order: 2,
        title: 'Task 1-2',
        estimatedMinutes: 60,
      }),
      createTask({
        id: taskId3,
        moduleId: moduleId2,
        order: 1,
        title: 'Task 2-1',
        estimatedMinutes: 90,
      }),
    ];

    const progressRows: TaskProgress[] = [
      createTaskProgress({
        id: progressId,
        taskId: taskId1,
        userId,
        status: 'completed',
        completedAt: new Date('2024-01-02'),
        updatedAt: new Date('2024-01-02'),
      }),
    ];

    const result = mapLearningPlanDetail({
      plan,
      moduleRows,
      taskRows,
      progressRows,
      resourceRows: [],
      latestAttempt: null,
      attemptsCount: 2,
    });

    expect(result.plan.id).toBe(planId);
    expect(result.plan.modules).toHaveLength(2);
    expect(result.plan.modules[0].tasks).toHaveLength(2);
    expect(result.plan.modules[1].tasks).toHaveLength(1);
    expect(result.totalTasks).toBe(3);
    expect(result.completedTasks).toBe(1);
  });

  it('should preserve attempt information when no modules exist', () => {
    const planId = createId('plan');
    const userId = createId('user');
    const plan = createLearningPlan({
      id: planId,
      userId,
      topic: 'Failed Plan',
    });

    const result = mapLearningPlanDetail({
      plan,
      moduleRows: [],
      taskRows: [],
      progressRows: [],
      resourceRows: [],
      latestAttempt: null,
      attemptsCount: 3,
    });

    expect(result.plan.id).toBe(planId);
    expect(result.attemptsCount).toBe(3);
  });
});
