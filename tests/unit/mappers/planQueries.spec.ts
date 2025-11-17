/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { describe, expect, it } from 'vitest';
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
  TaskResourceWithResource,
} from '@/lib/types/db';

describe('mapPlanSummaries', () => {
  it('should map plans with modules and tasks to summaries', () => {
    const planRows: LearningPlan[] = [
      {
        id: 'plan-1',
        userId: 'user-1',
        topic: 'TypeScript Fundamentals',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private' as const,
        origin: 'ai' as const,
        startDate: '2024-01-01',
        deadlineDate: '2024-03-01',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    ];

    const moduleRows: Module[] = [
      {
        id: 'module-1',
        planId: 'plan-1',
        order: 1,
        title: 'Introduction',
        description: 'Getting started',
        estimatedMinutes: 120,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
      {
        id: 'module-2',
        planId: 'plan-1',
        order: 2,
        title: 'Advanced Topics',
        description: 'Deep dive',
        estimatedMinutes: 180,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    ];

    const taskRows: SummaryTaskRow[] = [
      {
        id: 'task-1',
        moduleId: 'module-1',
        planId: 'plan-1',
        estimatedMinutes: 60,
        hasMicroExplanation: false,
      },
      {
        id: 'task-2',
        moduleId: 'module-1',
        planId: 'plan-1',
        estimatedMinutes: 60,
        hasMicroExplanation: false,
      },
      {
        id: 'task-3',
        moduleId: 'module-2',
        planId: 'plan-1',
        estimatedMinutes: 90,
      },
    ];

    const progressRows: ProgressStatusRow[] = [
      { taskId: 'task-1', status: 'completed' },
      { taskId: 'task-2', status: 'in_progress' },
    ];

    const result = mapPlanSummaries({
      planRows,
      moduleRows,
      taskRows,
      progressRows,
    });

    expect(result).toHaveLength(1);
    expect(result[0].plan.id).toBe('plan-1');
    expect(result[0].totalTasks).toBe(3);
    expect(result[0].completedTasks).toBe(1);
    expect(result[0].completion).toBeCloseTo(1 / 3);
    expect(result[0].totalMinutes).toBe(210);
    expect(result[0].completedMinutes).toBe(60);
    expect(result[0].modules).toHaveLength(2);
    expect(result[0].completedModules).toBe(0); // None are fully complete
  });

  it('should handle plans with no tasks', () => {
    const planRows: LearningPlan[] = [
      {
        id: 'plan-1',
        userId: 'user-1',
        topic: 'Empty Plan',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private' as const,
        origin: 'ai' as const,
        startDate: '2024-01-01',
        deadlineDate: '2024-03-01',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    ];

    const result = mapPlanSummaries({
      planRows,
      moduleRows: [],
      taskRows: [],
      progressRows: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0].totalTasks).toBe(0);
    expect(result[0].completedTasks).toBe(0);
    expect(result[0].completion).toBe(0);
    expect(result[0].totalMinutes).toBe(0);
    expect(result[0].completedMinutes).toBe(0);
    expect(result[0].modules).toHaveLength(0);
  });

  it('should handle null estimated minutes', () => {
    const planRows: LearningPlan[] = [
      {
        id: 'plan-1',
        userId: 'user-1',
        topic: 'Test Plan',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private' as const,
        origin: 'ai' as const,
        startDate: '2024-01-01',
        deadlineDate: '2024-03-01',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    ];

    const taskRows: SummaryTaskRow[] = [
      {
        id: 'task-1',
        moduleId: 'module-1',
        planId: 'plan-1',
        estimatedMinutes: null,
      },
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
    const planRows: LearningPlan[] = [
      {
        id: 'plan-1',
        userId: 'user-1',
        topic: 'Test Plan',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private' as const,
        origin: 'ai' as const,
        startDate: '2024-01-01',
        deadlineDate: '2024-03-01',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    ];

    const moduleRows: Module[] = [
      {
        id: 'module-1',
        planId: 'plan-1',
        order: 1,
        title: 'Module 1',
        description: null,
        estimatedMinutes: 60,
        hasMicroExplanation: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
      {
        id: 'module-2',
        planId: 'plan-1',
        order: 2,
        title: 'Module 2',
        description: null,
        estimatedMinutes: 60,
        hasMicroExplanation: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    ];

    const taskRows: SummaryTaskRow[] = [
      {
        id: 'task-1',
        moduleId: 'module-1',
        planId: 'plan-1',
        estimatedMinutes: 30,
        hasMicroExplanation: false,
      },
      {
        id: 'task-2',
        moduleId: 'module-1',
        planId: 'plan-1',
        estimatedMinutes: 30,
        hasMicroExplanation: false,
      },
      {
        id: 'task-3',
        moduleId: 'module-2',
        planId: 'plan-1',
        estimatedMinutes: 60,
        hasMicroExplanation: false,
      },
    ];

    const progressRows: ProgressStatusRow[] = [
      { taskId: 'task-1', status: 'completed' },
      { taskId: 'task-2', status: 'completed' },
      { taskId: 'task-3', status: 'in_progress' },
    ];

    const result = mapPlanSummaries({
      planRows,
      moduleRows,
      taskRows,
      progressRows,
    });

    expect(result[0].completedModules).toBe(1); // Only module-1 is fully complete
  });

  it('should handle multiple plans', () => {
    const planRows: LearningPlan[] = [
      {
        id: 'plan-1',
        userId: 'user-1',
        topic: 'Plan 1',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private' as const,
        origin: 'ai' as const,
        startDate: '2024-01-01',
        deadlineDate: '2024-03-01',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
      {
        id: 'plan-2',
        userId: 'user-1',
        topic: 'Plan 2',
        skillLevel: 'intermediate',
        weeklyHours: 10,
        learningStyle: 'reading',
        visibility: 'public',
        origin: 'manual',
        startDate: '2024-02-01',
        deadlineDate: '2024-04-01',
        createdAt: new Date('2024-02-01'),
        updatedAt: new Date('2024-02-01'),
      },
    ];

    const taskRows: SummaryTaskRow[] = [
      {
        id: 'task-1',
        moduleId: 'module-1',
        planId: 'plan-1',
        estimatedMinutes: 60,
        hasMicroExplanation: false,
      },
      {
        id: 'task-2',
        moduleId: 'module-2',
        planId: 'plan-2',
        estimatedMinutes: 90,
      },
    ];

    const result = mapPlanSummaries({
      planRows,
      moduleRows: [],
      taskRows,
      progressRows: [],
    });

    expect(result).toHaveLength(2);
    expect(result[0].totalTasks).toBe(1);
    expect(result[1].totalTasks).toBe(1);
  });
});

describe('mapLearningPlanDetail', () => {
  it('should map complete plan detail with all relationships', () => {
    const plan = {
      id: 'plan-1',
      userId: 'user-1',
      topic: 'TypeScript',
      skillLevel: 'intermediate',
      weeklyHours: 10,
      learningStyle: 'mixed',
      visibility: 'private' as const,
      origin: 'ai' as const,
      startDate: '2024-01-01',
      deadlineDate: '2024-03-01',
      notes: 'Test notes',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    const moduleRows: Module[] = [
      {
        id: 'module-1',
        planId: 'plan-1',
        order: 1,
        title: 'Introduction',
        description: 'Getting started',
        estimatedMinutes: 120,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    ];

    const taskRows: Task[] = [
      {
        id: 'task-1',
        moduleId: 'module-1',
        order: 1,
        title: 'Learn basics',
        description: 'Basic concepts',
        estimatedMinutes: 60,
        hasMicroExplanation: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    ];

    const progressRows: TaskProgress[] = [
      {
        id: 'progress-1',
        taskId: 'task-1',
        userId: 'user-1',
        status: 'completed',
        completedAt: new Date('2024-01-02'),
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      },
    ];

    const resourceRows: TaskResourceWithResource[] = [
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
          title: 'TypeScript Handbook',
          url: 'https://example.com/handbook',
          durationMinutes: 30,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      },
    ];

    const latestAttempt: GenerationAttempt = {
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
      metadata: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    const result = mapLearningPlanDetail({
      plan,
      moduleRows,
      taskRows,
      progressRows,
      resourceRows,
      latestAttempt,
      attemptsCount: 1,
      latestJobStatus: 'completed',
      latestJobError: null,
    });

    expect(result.plan.id).toBe('plan-1');
    expect(result.plan.modules).toHaveLength(1);
    expect(result.plan.modules[0].tasks).toHaveLength(1);
    expect(result.plan.modules[0].tasks[0].resources).toHaveLength(1);
    expect(result.plan.modules[0].tasks[0].progress?.status).toBe('completed');
    expect(result.totalTasks).toBe(1);
    expect(result.completedTasks).toBe(1);
    expect(result.latestAttempt).toEqual(latestAttempt);
    expect(result.attemptsCount).toBe(1);
    expect(result.latestJobStatus).toBe('completed');
    expect(result.latestJobError).toBeNull();
  });

  it('should handle null progress gracefully', () => {
    const plan = {
      id: 'plan-1',
      userId: 'user-1',
      topic: 'Test',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private' as const,
      origin: 'ai' as const,
      startDate: '2024-01-01',
      deadlineDate: '2024-03-01',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    const moduleRows: Module[] = [
      {
        id: 'module-1',
        planId: 'plan-1',
        order: 1,
        title: 'Module',
        description: null,
        estimatedMinutes: 60,
        hasMicroExplanation: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    ];

    const taskRows: Task[] = [
      {
        id: 'task-1',
        moduleId: 'module-1',
        order: 1,
        title: 'Task',
        description: null,
        estimatedMinutes: 60,
        hasMicroExplanation: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    ];

    const result = mapLearningPlanDetail({
      plan,
      moduleRows,
      taskRows,
      progressRows: [],
      resourceRows: [],
      latestAttempt: null,
      attemptsCount: 0,
      latestJobStatus: null,
      latestJobError: null,
    });

    expect(result.plan.modules[0].tasks[0].progress).toBeNull();
    expect(result.totalTasks).toBe(1);
    expect(result.completedTasks).toBe(0);
  });

  it('should handle empty modules and tasks', () => {
    const plan = {
      id: 'plan-1',
      userId: 'user-1',
      topic: 'Empty Plan',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private' as const,
      origin: 'ai' as const,
      startDate: '2024-01-01',
      deadlineDate: '2024-03-01',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    const result = mapLearningPlanDetail({
      plan,
      moduleRows: [],
      taskRows: [],
      progressRows: [],
      resourceRows: [],
      latestAttempt: null,
      attemptsCount: 0,
      latestJobStatus: 'pending',
      latestJobError: null,
    });

    expect(result.plan.modules).toHaveLength(0);
    expect(result.totalTasks).toBe(0);
    expect(result.completedTasks).toBe(0);
  });

  it('should handle multiple modules with multiple tasks each', () => {
    const plan = {
      id: 'plan-1',
      userId: 'user-1',
      topic: 'Complex Plan',
      skillLevel: 'advanced',
      weeklyHours: 15,
      learningStyle: 'mixed',
      visibility: 'private' as const,
      origin: 'ai' as const,
      startDate: '2024-01-01',
      deadlineDate: '2024-06-01',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    const moduleRows: Module[] = [
      {
        id: 'module-1',
        planId: 'plan-1',
        order: 1,
        title: 'Module 1',
        description: null,
        estimatedMinutes: 120,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
      {
        id: 'module-2',
        planId: 'plan-1',
        order: 2,
        title: 'Module 2',
        description: null,
        estimatedMinutes: 180,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    ];

    const taskRows: Task[] = [
      {
        id: 'task-1',
        moduleId: 'module-1',
        order: 1,
        title: 'Task 1-1',
        description: null,
        estimatedMinutes: 60,
        hasMicroExplanation: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
      {
        id: 'task-2',
        moduleId: 'module-1',
        order: 2,
        title: 'Task 1-2',
        description: null,
        estimatedMinutes: 60,
        hasMicroExplanation: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
      {
        id: 'task-3',
        moduleId: 'module-2',
        order: 1,
        title: 'Task 2-1',
        description: null,
        estimatedMinutes: 90,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    ];

    const progressRows: TaskProgress[] = [
      {
        id: 'progress-1',
        taskId: 'task-1',
        userId: 'user-1',
        status: 'completed',
        completedAt: new Date('2024-01-02'),
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      },
    ];

    const result = mapLearningPlanDetail({
      plan,
      moduleRows,
      taskRows,
      progressRows,
      resourceRows: [],
      latestAttempt: null,
      attemptsCount: 2,
      latestJobStatus: 'completed',
      latestJobError: null,
    });

    expect(result.plan.modules).toHaveLength(2);
    expect(result.plan.modules[0].tasks).toHaveLength(2);
    expect(result.plan.modules[1].tasks).toHaveLength(1);
    expect(result.totalTasks).toBe(3);
    expect(result.completedTasks).toBe(1);
  });

  it('should handle job error information', () => {
    const plan = {
      id: 'plan-1',
      userId: 'user-1',
      topic: 'Failed Plan',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private' as const,
      origin: 'ai' as const,
      startDate: '2024-01-01',
      deadlineDate: '2024-03-01',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    const result = mapLearningPlanDetail({
      plan,
      moduleRows: [],
      taskRows: [],
      progressRows: [],
      resourceRows: [],
      latestAttempt: null,
      attemptsCount: 3,
      latestJobStatus: 'failed',
      latestJobError: 'Generation timeout',
    });

    expect(result.latestJobStatus).toBe('failed');
    expect(result.latestJobError).toBe('Generation timeout');
  });
});
