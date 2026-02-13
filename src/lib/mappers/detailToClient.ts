import { ATTEMPT_CAP } from '@/lib/db/queries/attempts';
import { logger } from '@/lib/logging/logger';
import { derivePlanStatus } from '@/lib/plans/status';
import {
  type AttemptStatus,
  ClientGenerationAttempt,
  ClientPlanDetail,
  type FailureClassification,
} from '@/lib/types/client';
import type { GenerationAttempt, LearningPlanDetail } from '@/lib/types/db';

const VALID_ATTEMPT_STATUSES: ReadonlySet<AttemptStatus> = new Set([
  'success',
  'failure',
]);

const VALID_CLASSIFICATIONS: ReadonlySet<FailureClassification> = new Set([
  'validation',
  'provider_error',
  'rate_limit',
  'timeout',
  'capped',
]);

/**
 * Type guard to check if a value is a record object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validates and converts a string to AttemptStatus.
 * Logs a warning for unknown values and returns 'failure' as fallback.
 */
function toAttemptStatus(status: string): AttemptStatus {
  if (VALID_ATTEMPT_STATUSES.has(status as AttemptStatus)) {
    return status as AttemptStatus;
  }

  // Log unknown status values to aid debugging data corruption or schema mismatches
  // Logged in all environments to ensure production anomalies are visible
  logger.warn(
    { status },
    `[detailToClient] Unknown attempt status "${status}", falling back to "failure"`
  );

  return 'failure';
}

/**
 * Validates and converts a string to FailureClassification.
 * Returns null for invalid or missing values.
 */
function toClassification(
  classification: string | null | undefined
): FailureClassification | null {
  if (!classification) return null;
  if (VALID_CLASSIFICATIONS.has(classification as FailureClassification)) {
    return classification as FailureClassification;
  }

  // Log unknown classification values to aid debugging data corruption or schema mismatches
  // Logged in all environments to ensure production anomalies are visible
  logger.warn(
    { classification },
    `[detailToClient] Unknown failure classification "${classification}", returning null`
  );

  return null;
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

  // Log warning if successful attempt has a classification (unexpected data state)
  // Logged in all environments to ensure production anomalies are visible
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
      status === 'success' ? null : toClassification(attempt.classification),
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

export function mapDetailToClient(
  detail: LearningPlanDetail | null | undefined
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
    status: derivePlanStatus({
      generationStatus: plan.generationStatus,
      hasModules: modules.length > 0,
      attemptsCount: detail.attemptsCount,
      attemptCap: ATTEMPT_CAP,
    }),
    latestAttempt,
  };
}

export function mapAttemptsToClient(
  attempts: GenerationAttempt[]
): ClientGenerationAttempt[] {
  return attempts.map((attempt) => toClientAttempt(attempt));
}
