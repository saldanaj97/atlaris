import { describe, expect, it } from 'vitest';

import { ATTEMPT_CAP } from '@/lib/db/queries/attempts';
import { mapDetailToClient } from '@/lib/mappers/detailToClient';
import type {
  GenerationAttempt,
  LearningPlanDetail,
  LearningPlanWithModules,
  ModuleWithTasks,
  TaskWithRelations,
} from '@/lib/types/db';

const baseDate = new Date('2025-01-01T00:00:00.000Z');

function createTask(
  overrides: Partial<TaskWithRelations> = {}
): TaskWithRelations {
  return {
    id: 'task-1',
    moduleId: 'module-1',
    order: 1,
    title: 'Task Title',
    description: 'Task description',
    estimatedMinutes: 30,
    createdAt: baseDate,
    updatedAt: baseDate,
    resources: [],
    progress: null,
    ...overrides,
  } satisfies TaskWithRelations;
}

function createModule(
  overrides: Partial<ModuleWithTasks> = {}
): ModuleWithTasks {
  return {
    id: 'module-1',
    planId: 'plan-1',
    order: 1,
    title: 'Module Title',
    description: 'Module description',
    estimatedMinutes: 120,
    createdAt: baseDate,
    updatedAt: baseDate,
    tasks: [createTask()],
    ...overrides,
  } satisfies ModuleWithTasks;
}

function createPlan(
  overrides: Partial<LearningPlanWithModules> = {}
): LearningPlanWithModules {
  return {
    id: 'plan-1',
    userId: 'user-1',
    topic: 'Example Plan',
    skillLevel: 'beginner',
    weeklyHours: 5,
    learningStyle: 'mixed',
    startDate: null,
    deadlineDate: null,
    visibility: 'private',
    origin: 'ai',
    createdAt: baseDate,
    updatedAt: baseDate,
    modules: [],
    ...overrides,
  } satisfies LearningPlanWithModules;
}

function createAttempt(
  overrides: Partial<GenerationAttempt> = {}
): GenerationAttempt {
  return {
    id: 'attempt-1',
    planId: 'plan-1',
    status: 'success',
    classification: null,
    durationMs: 4200,
    modulesCount: 4,
    tasksCount: 16,
    truncatedTopic: false,
    truncatedNotes: false,
    normalizedEffort: false,
    promptHash: 'hash',
    metadata: {
      provider: {
        model: 'mock-gpt',
      },
    },
    createdAt: baseDate,
    ...overrides,
  } satisfies GenerationAttempt;
}

interface CreateDetailOptions {
  plan?: Partial<LearningPlanWithModules>;
  totalTasks?: number;
  completedTasks?: number;
  latestAttempt?: GenerationAttempt | null;
  attemptsCount?: number;
}

function createDetail(options: CreateDetailOptions = {}): LearningPlanDetail {
  const plan = createPlan(options.plan);
  return {
    plan,
    totalTasks: options.totalTasks ?? 0,
    completedTasks: options.completedTasks ?? 0,
    latestAttempt: options.latestAttempt ?? null,
    attemptsCount: options.attemptsCount ?? 0,
  } satisfies LearningPlanDetail;
}

describe('mapDetailToClient', () => {
  it('maps ready plan with latest attempt metadata', () => {
    const attempt = createAttempt();
    const detail = createDetail({
      plan: { modules: [createModule()] },
      totalTasks: 1,
      completedTasks: 0,
      latestAttempt: attempt,
      attemptsCount: 1,
    });

    const result = mapDetailToClient(detail);
    expect(result).toBeDefined();
    expect(result?.status).toBe('ready');
    expect(result?.latestAttempt).toMatchObject({
      id: attempt.id,
      status: 'success',
      classification: null,
      model: 'mock-gpt',
      createdAt: baseDate.toISOString(),
    });
  });

  it('marks plan as failed when attempt cap reached with no modules', () => {
    const failureAttempt = createAttempt({
      id: 'attempt-2',
      status: 'failure',
      classification: 'timeout',
      modulesCount: 0,
      tasksCount: 0,
    });
    const detail = createDetail({
      plan: { modules: [] },
      latestAttempt: failureAttempt,
      attemptsCount: ATTEMPT_CAP,
    });

    const result = mapDetailToClient(detail);
    expect(result?.status).toBe('failed');
    expect(result?.latestAttempt?.classification).toBe('timeout');
  });

  it('returns pending status when no modules and attempts remaining', () => {
    const detail = createDetail({
      plan: { modules: [] },
      attemptsCount: 1,
      latestAttempt: null,
    });

    const result = mapDetailToClient(detail);
    expect(result?.status).toBe('pending');
    expect(result?.latestAttempt).toBeNull();
  });
});
