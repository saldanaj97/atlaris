import { ATTEMPT_CAP } from '@/lib/db/queries/attempts';
import {
  ClientGenerationAttempt,
  ClientPlanDetail,
  PlanStatus,
} from '@/lib/types/client';
import { GenerationAttempt, LearningPlanDetail } from '../types/db';

function toClientAttempt(attempt: GenerationAttempt): ClientGenerationAttempt {
  const metadata =
    attempt.metadata && typeof attempt.metadata === 'object'
      ? (attempt.metadata as Record<string, unknown>)
      : null;

  let model: string | null = null;
  const provider =
    metadata && typeof metadata.provider === 'object'
      ? (metadata.provider as Record<string, unknown>)
      : null;
  if (provider && typeof provider.model === 'string') {
    model = provider.model;
  }

  return {
    id: attempt.id,
    status: attempt.status as ClientGenerationAttempt['status'],
    classification:
      attempt.status === 'success'
        ? null
        : ((attempt.classification as ClientGenerationAttempt['classification']) ??
          null),
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

function derivePlanStatus(detail: LearningPlanDetail): PlanStatus | undefined {
  const modulesCount = detail.plan.modules.length;

  if (modulesCount > 0) {
    return 'ready';
  }

  if (detail.attemptsCount >= ATTEMPT_CAP) {
    return 'failed';
  }

  return 'pending';
}

export function mapDetailToClient(
  detail: LearningPlanDetail
): ClientPlanDetail | undefined {
  if (!detail) return undefined;

  const { plan } = detail;
  if (!plan) return undefined;

  const modules = [...(plan.modules ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((module) => {
      const tasks = [...(module.tasks ?? [])]
        .sort((a, b) => a.order - b.order)
        .map((task) => ({
          id: task.id,
          order: task.order,
          title: task.title,
          description: task.description ?? null,
          estimatedMinutes: task.estimatedMinutes ?? 0,
          status: task.progress?.status ?? 'not_started',
          resources: [...(task.resources ?? [])]
            .sort((a, b) => a.order - b.order)
            .map((resource) => ({
              id: resource.id,
              order: resource.order,
              type: resource.resource.type,
              title: resource.resource.title,
              url: resource.resource.url,
              durationMinutes: resource.resource.durationMinutes ?? null,
            })),
        }));

      return {
        id: module.id,
        order: module.order,
        title: module.title,
        description: module.description ?? null,
        estimatedMinutes: module.estimatedMinutes ?? 0,
        tasks,
      };
    });

  const latestAttempt = detail.latestAttempt
    ? toClientAttempt(detail.latestAttempt)
    : null;

  return {
    id: plan.id,
    topic: plan.topic,
    skillLevel: plan.skillLevel,
    weeklyHours: plan.weeklyHours,
    learningStyle: plan.learningStyle,
    visibility: plan.visibility,
    origin: plan.origin,
    createdAt: plan.createdAt?.toISOString(),
    modules,
    status: derivePlanStatus(detail),
    latestAttempt,
  };
}

export function mapAttemptsToClient(
  attempts: GenerationAttempt[]
): ClientGenerationAttempt[] {
  return attempts.map((attempt) => toClientAttempt(attempt));
}
