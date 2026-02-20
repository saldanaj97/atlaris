/**
 * Shared fixtures for LearningPlanDetail, GenerationAttempt, and related types.
 * Used by mapper tests (detailToClient, derivation) and plan access tests.
 */

import type {
  ModuleWithTasks,
  TaskResourceWithResource,
  TaskWithRelations,
} from '@/lib/db/queries/types/modules.types';
import type {
  GenerationAttempt,
  LearningPlanDetail,
  LearningPlanWithModules,
  Module,
  PlanSummary,
} from '@/lib/types/db';

import { createId } from './ids';

const BASE_DATE = new Date('2025-01-01T00:00:00.000Z');

/** Builds a GenerationAttempt with failure defaults (for status-derivation tests). */
export function buildGenerationAttempt(
  overrides: Partial<GenerationAttempt> = {}
): GenerationAttempt {
  const planId = overrides.planId ?? createId('plan');
  return {
    id: overrides.id ?? createId('attempt'),
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
  const planId = overrides.planId ?? createId('plan');
  return {
    id: overrides.id ?? createId('attempt'),
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
  const taskId = overrides.taskId ?? createId('task');
  const resourceId =
    overrides.resourceId ?? overrides.resource?.id ?? createId('resource');
  const { resource: resourceOverrides, ...rowOverrides } = overrides;
  return {
    id: overrides.id ?? createId('task-resource'),
    taskId,
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
      ...resourceOverrides,
    },
    ...rowOverrides,
    resourceId,
  } satisfies TaskResourceWithResource;
}

/** Builds a TaskWithRelations for module fixtures. */
export function buildTask(
  overrides: Partial<TaskWithRelations> = {}
): TaskWithRelations {
  const moduleId = overrides.moduleId ?? createId('module');
  const taskId = overrides.id ?? createId('task');
  const resourceId = createId('resource');
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
  const planId = overrides.planId ?? createId('plan');
  const moduleId = overrides.id ?? createId('module');
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
      id: overrides.id ?? createId('module'),
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
    id: overrides.id ?? createId('plan'),
    userId: overrides.userId ?? createId('user'),
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
