import { ATTEMPT_CAP } from '@/features/ai/generation-policy';
import { computeCompletionMetricsFromNestedModules } from '@/features/plans/read-models/completion-metrics';
import { derivePlanStatus } from '@/features/plans/status';
import type { TaskResourceWithResource } from '@/lib/db/queries/types/modules.types';
import { logger } from '@/lib/logging/logger';
import type {
  AttemptStatus,
  ClientGenerationAttempt,
  ClientPlanDetail,
  PlanStatus as ClientPlanStatus,
  FailureClassification,
} from '@/shared/types/client.types';
import type {
  GenerationAttempt,
  LearningPlan,
  LearningPlanDetail,
  Module,
  Task,
  TaskProgress,
} from '@/shared/types/db.types';

const VALID_ATTEMPT_STATUSES: ReadonlySet<AttemptStatus> = new Set([
  'success',
  'failure',
  'in_progress',
]);

const VALID_CLASSIFICATIONS: ReadonlySet<FailureClassification> = new Set([
  'validation',
  'provider_error',
  'rate_limit',
  'timeout',
  'capped',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toAttemptStatus(status: string): AttemptStatus {
  if (VALID_ATTEMPT_STATUSES.has(status as AttemptStatus)) {
    return status as AttemptStatus;
  }

  logger.warn(
    { status },
    `[detailToClient] Unknown attempt status "${status}", falling back to "failure"`
  );

  return 'failure';
}

function toClassification(
  classification: string | null | undefined
): FailureClassification | null {
  if (!classification) return null;
  if (VALID_CLASSIFICATIONS.has(classification as FailureClassification)) {
    return classification as FailureClassification;
  }

  logger.warn(
    { classification },
    `[detailToClient] Unknown failure classification "${classification}", returning null`
  );

  return null;
}

function toStatusClassification(
  classification: string | null | undefined
): FailureClassification | 'unknown' | null {
  if (!classification) return null;

  const normalized = toClassification(classification);
  return normalized ?? 'unknown';
}

export type PlanDetailStatusSnapshot = {
  planId: string;
  status: ClientPlanStatus;
  attempts: number;
  latestClassification: FailureClassification | 'unknown' | null;
  createdAt: string | undefined;
  updatedAt: string | undefined;
};

export function buildPlanDetailStatusSnapshot(params: {
  plan: Pick<
    LearningPlan,
    'id' | 'generationStatus' | 'createdAt' | 'updatedAt'
  >;
  hasModules: boolean;
  attemptsCount: number;
  latestAttempt: Pick<GenerationAttempt, 'classification'> | null;
}): PlanDetailStatusSnapshot {
  const { plan, hasModules, attemptsCount, latestAttempt } = params;

  return {
    planId: plan.id,
    status: derivePlanStatus({
      generationStatus: plan.generationStatus,
      hasModules,
      attemptsCount,
      attemptCap: ATTEMPT_CAP,
    }),
    attempts: attemptsCount,
    latestClassification: toStatusClassification(latestAttempt?.classification),
    createdAt: plan.createdAt?.toISOString(),
    updatedAt: plan.updatedAt?.toISOString(),
  } satisfies PlanDetailStatusSnapshot;
}

function toClientAttempt(attempt: GenerationAttempt): ClientGenerationAttempt {
  const metadata = isRecord(attempt.metadata) ? attempt.metadata : null;

  let model: string | null = null;
  if (metadata && isRecord(metadata.provider)) {
    const provider = metadata.provider;
    if (typeof provider.model === 'string') {
      model = provider.model;
    }
  }

  const status = toAttemptStatus(attempt.status);

  if (status === 'success' && attempt.classification) {
    logger.warn(
      { attemptId: attempt.id, classification: attempt.classification },
      '[detailToClient] Success attempt has unexpected classification'
    );
  }

  return {
    id: attempt.id,
    status,
    classification:
      status === 'failure' ? toClassification(attempt.classification) : null,
    durationMs: attempt.durationMs,
    modulesCount: attempt.modulesCount,
    tasksCount: attempt.tasksCount,
    truncatedTopic: attempt.truncatedTopic,
    truncatedNotes: attempt.truncatedNotes,
    normalizedEffort: attempt.normalizedEffort,
    promptHash: attempt.promptHash ?? null,
    metadata,
    model,
    createdAt: attempt.createdAt.toISOString(),
  } satisfies ClientGenerationAttempt;
}

export function buildLearningPlanDetail(params: {
  plan: LearningPlan;
  moduleRows: Module[];
  taskRows: Task[];
  progressRows: TaskProgress[];
  resourceRows: TaskResourceWithResource[];
  latestAttempt: GenerationAttempt | null;
  attemptsCount: number;
}): LearningPlanDetail {
  const {
    plan,
    moduleRows,
    taskRows,
    progressRows,
    resourceRows,
    latestAttempt,
    attemptsCount,
  } = params;

  const progressByTask = new Map(progressRows.map((row) => [row.taskId, row]));
  const resourcesByTask = resourceRows.reduce((acc, row) => {
    const existing = acc.get(row.taskId) ?? [];
    existing.push(row);
    acc.set(row.taskId, existing);
    return acc;
  }, new Map<string, TaskResourceWithResource[]>());

  const tasksByModule = taskRows.reduce((acc, task) => {
    const existing = acc.get(task.moduleId) ?? [];
    existing.push({
      ...task,
      resources: (resourcesByTask.get(task.id) ?? []).toSorted(
        (a, b) => a.order - b.order
      ),
      progress: progressByTask.get(task.id) ?? null,
    });
    acc.set(task.moduleId, existing);
    return acc;
  }, new Map<string, LearningPlanDetail['plan']['modules'][number]['tasks']>());

  const modules = moduleRows
    .toSorted((a, b) => a.order - b.order)
    .map((planModule) => ({
      ...planModule,
      tasks: (tasksByModule.get(planModule.id) ?? []).toSorted(
        (a, b) => a.order - b.order
      ),
    }));

  const {
    totalTasks,
    completedTasks,
    totalMinutes,
    completedMinutes,
    completedModules,
  } = computeCompletionMetricsFromNestedModules(modules);

  return {
    plan: {
      ...plan,
      modules,
    },
    totalTasks,
    completedTasks,
    totalMinutes,
    completedMinutes,
    completedModules,
    latestAttempt,
    attemptsCount,
  } satisfies LearningPlanDetail;
}

export function toClientPlanDetail(
  detail: LearningPlanDetail | null | undefined
): ClientPlanDetail | undefined {
  if (!detail) return undefined;

  if (!detail.plan) {
    logger.error(
      { detail },
      'LearningPlanDetail missing required plan payload'
    );
    throw new Error('LearningPlanDetail.plan is required.');
  }

  const modules = (detail.plan.modules ?? []).map((planModule) => {
    const tasks = (planModule.tasks ?? []).map((task) => ({
      id: task.id,
      order: task.order,
      title: task.title,
      description: task.description ?? null,
      estimatedMinutes: task.estimatedMinutes ?? 0,
      status: task.progress?.status ?? 'not_started',
      resources: (task.resources ?? []).map((resource) => ({
        id: resource.id,
        order: resource.order,
        type: resource.resource.type,
        title: resource.resource.title,
        url: resource.resource.url,
        durationMinutes: resource.resource.durationMinutes ?? null,
      })),
    }));

    return {
      id: planModule.id,
      order: planModule.order,
      title: planModule.title,
      description: planModule.description ?? null,
      estimatedMinutes: planModule.estimatedMinutes ?? 0,
      tasks,
    };
  });

  const statusSnapshot = buildPlanDetailStatusSnapshot({
    plan: detail.plan,
    hasModules: modules.length > 0,
    attemptsCount: detail.attemptsCount,
    latestAttempt: detail.latestAttempt,
  });

  return {
    id: detail.plan.id,
    topic: detail.plan.topic,
    skillLevel: detail.plan.skillLevel,
    weeklyHours: detail.plan.weeklyHours,
    learningStyle: detail.plan.learningStyle,
    visibility: detail.plan.visibility,
    origin: detail.plan.origin,
    createdAt: detail.plan.createdAt?.toISOString(),
    modules,
    totalTasks: detail.totalTasks,
    completedTasks: detail.completedTasks,
    totalMinutes: detail.totalMinutes,
    completedMinutes: detail.completedMinutes,
    completedModules: detail.completedModules,
    status: statusSnapshot.status,
    latestAttempt: detail.latestAttempt
      ? toClientAttempt(detail.latestAttempt)
      : null,
  } satisfies ClientPlanDetail;
}

export function toClientGenerationAttempts(
  attempts: GenerationAttempt[]
): ClientGenerationAttempt[] {
  return attempts.map((attempt) => toClientAttempt(attempt));
}
