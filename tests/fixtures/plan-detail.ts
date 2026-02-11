/**
 * Shared fixtures for LearningPlanDetail, GenerationAttempt, and related types.
 * Used by mapper tests (detailToClient, derivation) and plan access tests.
 */

import type {
  GenerationAttempt,
  LearningPlanDetail,
  LearningPlanWithModules,
  Module,
  ModuleWithTasks,
  PlanSummary,
  TaskResourceWithResource,
  TaskWithRelations,
} from '@/lib/types/db';

const BASE_DATE = new Date('2025-01-01T00:00:00.000Z');

/** Builds a GenerationAttempt with failure defaults (for status-derivation tests). */
export function buildGenerationAttempt(
  overrides: Partial<GenerationAttempt> = {}
): GenerationAttempt {
  return {
    id: 'attempt-1',
    planId: 'plan-1',
    status: 'failure',
    classification: 'timeout',
    durationMs: 10_000,
    modulesCount: 0,
    tasksCount: 0,
    truncatedTopic: false,
    truncatedNotes: false,
    normalizedEffort: false,
    promptHash: null,
    metadata: null,
    createdAt: new Date('2024-01-01T00:00:05.000Z'),
    ...overrides,
  } satisfies GenerationAttempt;
}

/** Builds a GenerationAttempt with success defaults (for mapAttemptsToClient etc). */
export function buildSuccessAttempt(
  overrides: Partial<GenerationAttempt> = {}
): GenerationAttempt {
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

/** Builds a TaskResourceWithResource for task fixtures. */
export function buildTaskResource(
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

/** Builds a TaskWithRelations for module fixtures. */
export function buildTask(
  overrides: Partial<TaskWithRelations> = {}
): TaskWithRelations {
  return {
    id: 'task-1',
    moduleId: 'module-1',
    order: 1,
    title: 'Read intro article',
    description: 'Basics overview',
    estimatedMinutes: 45,
    hasMicroExplanation: false,
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
    resources: [buildTaskResource()],
    progress: null,
    ...overrides,
  } satisfies TaskWithRelations;
}

/** Builds a ModuleWithTasks. Use tasks: [] for minimal status-derivation tests. */
export function buildModule(
  overrides: Partial<ModuleWithTasks> = {}
): ModuleWithTasks {
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

/** Builds a Module (plan row only, no tasks). Use for PlanSummary.modules. */
export function buildModuleRow(overrides: Partial<Module> = {}): Module {
  const { tasks: _tasks, ...row } = buildModule();
  return { ...row, ...overrides } satisfies Module;
}

/** Builds N module rows for a plan. Use for PlanSummary.modules. */
export function buildModuleRows(
  planId: string,
  count: number,
  overrides: Partial<Module> = {}
): Module[] {
  return Array.from({ length: count }, (_, i) =>
    buildModuleRow({
      id: `mod-${i + 1}`,
      planId,
      order: i + 1,
      ...overrides,
    })
  );
}

/** Builds a LearningPlanWithModules. */
export function buildPlan(
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
    extractedContext: null,
    generationStatus: 'generating',
    isQuotaEligible: false,
    finalizedAt: null,
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
    modules: [],
    ...overrides,
  } satisfies LearningPlanWithModules;
}

/** Builds a LearningPlanDetail with optional overrides for all fields. */
export function buildPlanDetail(
  overrides: Partial<LearningPlanDetail> = {}
): LearningPlanDetail {
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

/** Builds a PlanSummary with optional overrides. Centralizes schema so type changes stay in one place. */
export function buildPlanSummary(
  overrides: Partial<PlanSummary> = {}
): PlanSummary {
  const fullPlan = buildPlan();
  const { modules: _planModules, ...plan } = fullPlan;
  const modules = buildModuleRows(plan.id, 2);
  return {
    plan,
    completion: 0,
    completedModules: 0,
    completedTasks: 0,
    totalTasks: 0,
    totalMinutes: 0,
    completedMinutes: 0,
    modules,
    ...overrides,
  } satisfies PlanSummary;
}
