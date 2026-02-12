// ─────────────────────────────────────────────────────────────────────────────
// Stream Result Handlers
// ─────────────────────────────────────────────────────────────────────────────

import { getModelById } from '@/lib/ai/ai-models';
import { isRetryableClassification } from '@/lib/ai/failures';
import type { GenerationResult } from '@/lib/ai/orchestrator';
import type { ParsedModule } from '@/lib/ai/parser';
import { sanitizeSseError } from '@/lib/ai/streaming/error-sanitizer';
import type { StreamingEvent } from '@/lib/ai/streaming/types';
import { getCorrelationId } from '@/lib/api/context';
import type { AttemptsDbClient } from '@/lib/db/queries/attempts';
import { getDb } from '@/lib/db/runtime';
import { recordUsage } from '@/lib/db/usage';
import { logger } from '@/lib/logging/logger';
import {
  markPlanGenerationFailure,
  markPlanGenerationSuccess,
} from '@/lib/stripe/usage';
import type { CreateLearningPlanInput } from '@/lib/validation/learningPlans';

type EmitFn = (event: StreamingEvent) => void;

interface GenerationContext {
  planId: string;
  userId: string;
  dbClient: AttemptsDbClient;
  emit: EmitFn;
}

interface SuccessContext extends GenerationContext {
  startedAt: number;
}

/**
 * Handle a successful plan generation result.
 * Emits module summaries, marks the plan generation as successful, records usage,
 * and emits a final 'complete' event with counts and duration.
 *
 * @param result - Generation result (status 'success')
 * @param ctx - Context containing planId, userId, startedAt and emit function
 */
export async function handleSuccessfulGeneration(
  result: Extract<GenerationResult, { status: 'success' }>,
  ctx: SuccessContext
): Promise<void> {
  const { planId, userId, startedAt, emit, dbClient } = ctx;
  const modules = result.modules;
  const modulesCount = modules.length;
  const tasksCount = modules.reduce((sum, m) => sum + m.tasks.length, 0);

  emitModuleSummaries(modules, planId, emit);

  await markPlanGenerationSuccess(planId, dbClient);
  await tryRecordUsage(userId, result, dbClient);

  emit({
    type: 'complete',
    data: {
      planId,
      modulesCount,
      tasksCount,
      durationMs: Math.max(0, Date.now() - startedAt),
    },
  });
}

/**
 * Handle a failed plan generation result.
 * Determines if the failure is retryable, marks the plan as failed and records usage when not retryable,
 * and emits an 'error' event with classification and retryable flag.
 *
 * @param result - Generation result (status 'failure')
 * @param ctx - Context containing planId, userId and emit function
 */
export async function handleFailedGeneration(
  result: Extract<GenerationResult, { status: 'failure' }>,
  ctx: GenerationContext
): Promise<void> {
  const { planId, userId, emit, dbClient } = ctx;

  const classification = result.classification ?? 'unknown';
  const retryable = isRetryableClassification(classification);

  if (!retryable) {
    await markPlanGenerationFailure(planId, dbClient);
    await tryRecordUsage(userId, result, dbClient);
  }

  const sanitized = sanitizeSseError(result.error, classification, {
    planId,
    userId,
  });
  const requestId = getCorrelationId();

  emit({
    type: 'error',
    data: {
      planId,
      code: sanitized.code,
      message: sanitized.message,
      classification,
      retryable: sanitized.retryable,
      ...(requestId ? { requestId } : {}),
    },
  });
}

/**
 * Emits module summaries and progress events for each parsed module.
 *
 * @param modules - Parsed modules to emit summaries for
 * @param planId - Associated plan id
 * @param emit - Emit function to send StreamingEvents
 */
export function emitModuleSummaries(
  modules: ParsedModule[],
  planId: string,
  emit: EmitFn
): void {
  const modulesCount = modules.length;

  modules.forEach((module, index) => {
    emit({
      type: 'module_summary',
      data: {
        planId,
        index,
        title: module.title,
        description: module.description ?? null,
        estimatedMinutes: module.estimatedMinutes,
        tasksCount: module.tasks.length,
      },
    });

    emit({
      type: 'progress',
      data: {
        planId,
        modulesParsed: index + 1,
        modulesTotalHint: modulesCount,
      },
    });
  });
}

/**
 * Build a 'plan_start' StreamingEvent from input and planId.
 *
 * @param param0 - Object containing planId and CreateLearningPlanInput
 * @returns StreamingEvent ready to emit when plan generation starts
 */
export function buildPlanStartEvent({
  planId,
  input,
}: {
  planId: string;
  input: CreateLearningPlanInput;
}): StreamingEvent {
  return {
    type: 'plan_start',
    data: {
      planId,
      topic: input.topic,
      skillLevel: input.skillLevel,
      learningStyle: input.learningStyle,
      weeklyHours: input.weeklyHours,
      startDate: input.startDate ?? null,
      deadlineDate: input.deadlineDate ?? null,
      ...(input.origin && { origin: input.origin }),
    },
  };
}

/**
 * Attempts to record usage information from generation metadata. Errors are logged but do not throw.
 *
 * @param userId - ID of the user to associate usage with
 * @param result - GenerationResult containing metadata and usage information
 */
function computeCostCents(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const model = getModelById(modelId);
  if (!model) {
    logger.warn(
      {
        modelId,
        inputTokens,
        outputTokens,
        source: 'computeCostCents',
        lookup: 'getModelById',
      },
      'computeCostCents: getModelById returned null for unknown/misconfigured modelId, returning 0'
    );
    return 0;
  }
  if (inputTokens === 0 && outputTokens === 0) return 0;
  const totalUsd =
    (inputTokens / 1_000_000) * model.inputCostPerMillion +
    (outputTokens / 1_000_000) * model.outputCostPerMillion;
  return Math.round(totalUsd * 100);
}

export async function tryRecordUsage(
  userId: string,
  result: GenerationResult,
  dbClient?: AttemptsDbClient
): Promise<void> {
  try {
    const usage = result.metadata?.usage;
    const modelId = result.metadata?.model ?? 'unknown';
    const inputTokens = usage?.promptTokens;
    const outputTokens = usage?.completionTokens;
    const costCents =
      modelId !== 'unknown' &&
      typeof inputTokens === 'number' &&
      typeof outputTokens === 'number'
        ? computeCostCents(modelId, inputTokens, outputTokens)
        : 0;

    await recordUsage(
      {
        userId,
        provider: result.metadata?.provider ?? 'unknown',
        model: modelId,
        inputTokens,
        outputTokens,
        costCents,
        kind: 'plan',
      },
      dbClient
    );
  } catch (usageError) {
    logger.error(
      {
        error: usageError,
        userId,
        provider: result.metadata?.provider ?? 'unknown',
        model: result.metadata?.model ?? 'unknown',
      },
      'Failed to record usage after generation.'
    );
  }
}

/**
 * Safely mark a plan as failed, logging errors if marking fails.
 *
 * @param planId - ID of the plan to mark failed
 * @param userId - ID of the user owning the plan (for logging)
 * @param dbClient - Optional RLS client; defaults to getDb() for module-style usage
 */
export async function safeMarkPlanFailed(
  planId: string,
  userId: string,
  dbClient: AttemptsDbClient = getDb()
): Promise<void> {
  try {
    await markPlanGenerationFailure(planId, dbClient);
  } catch (markErr) {
    logger.error(
      { error: markErr, planId, userId },
      'Failed to mark plan as failed after generation error.'
    );
  }
}
