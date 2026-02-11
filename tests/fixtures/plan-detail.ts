/**
 * Shared fixtures for LearningPlanDetail, GenerationAttempt, and related types.
 * Used by mapper tests (detailToClient, derivation) and plan access tests.
 */

import { nanoid } from 'nanoid';

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

function makeId(prefix: string): string {
  return `${prefix}-${nanoid(8)}`;
}

/** Builds a GenerationAttempt with failure defaults (for status-derivation tests). */
export function buildGenerationAttempt(
  overrides: Partial<GenerationAttempt> = {}
): GenerationAttempt {
  const planId = overrides.planId ?? makeId('plan');
  return {
    id: overrides.id ?? makeId('attempt'),
    planId,
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
  const planId = overrides.planId ?? makeId('plan');
  return {
    id: overrides.id ?? makeId('attempt'),
    planId,
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
  const taskId = overrides.taskId ?? makeId('task');
  const resourceId = overrides.resourceId ?? makeId('resource');
  return {
    id: overrides.id ?? makeId('task-resource'),
    taskId,
    resourceId,
    order: 1,
    notes: null,
    createdAt: BASE_DATE,
    resource: {
      id: resourceId,
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
  const moduleId = overrides.moduleId ?? makeId('module');
  const taskId = overrides.id ?? makeId('task');
  const resourceId = makeId('resource');
  return {
    id: taskId,
    moduleId,
    order: 1,
    title: 'Read intro article',
    description: 'Basics overview',
    estimatedMinutes: 45,
    hasMicroExplanation: false,
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
    resources: [buildTaskResource({ taskId, resourceId })],
    progress: null,
    ...overrides,
  } satisfies TaskWithRelations;
}

/** Builds a ModuleWithTasks. Use tasks: [] for minimal status-derivation tests. */
export function buildModule(
  overrides: Partial<ModuleWithTasks> = {}
): ModuleWithTasks {
  const planId = overrides.planId ?? makeId('plan');
  const moduleId = overrides.id ?? makeId('module');
  return {
    id: moduleId,
    planId,
    order: 1,
    title: 'Module 1',
    description: 'Getting started',
    estimatedMinutes: 120,
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
    tasks: [buildTask({ moduleId })],
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
      ...overrides,
      id: makeId('module'),
      planId,
      order: i + 1,
    })
  );
}

/** Builds a LearningPlanWithModules. */
export function buildPlan(
  overrides: Partial<LearningPlanWithModules> = {}
): LearningPlanWithModules {
  return {
    id: overrides.id ?? makeId('plan'),
    userId: overrides.userId ?? makeId('user'),
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
