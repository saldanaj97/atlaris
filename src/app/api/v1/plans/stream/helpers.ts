// ─────────────────────────────────────────────────────────────────────────────
// Stream Result Handlers
// ─────────────────────────────────────────────────────────────────────────────

import { attachAbortListener } from '@/lib/ai/abort';
import { getModelById } from '@/lib/ai/ai-models';
import { isRetryableClassification } from '@/lib/ai/failures';
import type { GenerationResult } from '@/lib/ai/orchestrator';
import type { ParsedModule } from '@/lib/ai/parser';
import {
  sanitizeSseError,
  type ErrorLike,
  type GenerationError,
} from '@/lib/ai/streaming/error-sanitizer';
import type { StreamingEvent } from '@/lib/ai/streaming/types';
import { getCorrelationId } from '@/lib/api/context';
import type { AttemptsDbClient } from '@/lib/db/queries/attempts.types';
import { getDb } from '@/lib/db/runtime';
import { recordUsage } from '@/lib/db/usage';
import { logger } from '@/lib/logging/logger';
import {
  markPlanGenerationFailure,
  markPlanGenerationSuccess,
} from '@/lib/stripe/usage';
import type { FailureClassification } from '@/lib/types/client';
import type { CreateLearningPlanInput } from '@/lib/validation/learningPlans';

type EmitFn = (event: StreamingEvent) => void;

export interface StreamingHelperDependencies {
  markPlanGenerationFailure?: typeof markPlanGenerationFailure;
  markPlanGenerationSuccess?: typeof markPlanGenerationSuccess;
  recordUsage?: typeof recordUsage;
  getCorrelationId?: typeof getCorrelationId;
}

interface GenerationContext extends StreamingHelperDependencies {
  planId: string;
  userId: string;
  dbClient: AttemptsDbClient;
  emit: EmitFn;
}

interface SuccessContext extends GenerationContext {
  startedAt: number;
}

interface EmitSanitizedFailureEventParams {
  emit: EmitFn;
  error: GenerationError | ErrorLike;
  classification: FailureClassification | 'unknown';
  planId: string;
  userId: string;
  getCorrelationId?: typeof getCorrelationId;
}

interface EmitCancelledEventParams {
  emit: EmitFn;
  error: GenerationError | ErrorLike;
  planId: string;
  userId: string;
  getCorrelationId?: typeof getCorrelationId;
}

/**
 * Sanitizes a generation error and emits a client-safe SSE `error` event.
 *
 * @param params.emit - Event emitter used to push a `StreamingEvent` into the SSE stream
 * @param params.error - Raw generation error (provider, parser, timeout, or domain error shape)
 * @param params.classification - Failure kind used for safe client mapping:
 * - `validation`: model output is invalid (non-retryable)
 * - `provider_error`: upstream provider/API failure (usually retryable)
 * - `rate_limit`: provider throttled request (retryable)
 * - `timeout`: generation timed out (retryable)
 * - `capped`: attempt cap reached (non-retryable)
 * - `in_progress`: generation already running for plan (retryable)
 * - `unknown`: fallback when no specific classification exists
 * @param params.planId - Learning plan id associated with the error
 * @param params.userId - User id associated with the error
 * @param params.getCorrelationId - Optional request-id resolver override for tests
 *
 * @remarks The emitted payload is sanitized via `sanitizeSseError` before calling `emit`,
 * so raw internal/provider details are never sent to the client.
 */
export function emitSanitizedFailureEvent({
  emit,
  error,
  classification,
  planId,
  userId,
  getCorrelationId: getCorrelationIdOverride,
}: EmitSanitizedFailureEventParams): void {
  const sanitized = sanitizeSseError(error, classification, {
    planId,
    userId,
  });
  const requestId = (getCorrelationIdOverride ?? getCorrelationId)();

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
 * Emits a dedicated `cancelled` event when generation is aborted/cancelled.
 * This intentionally does not emit a terminal `error` event.
 */
export function emitCancelledEvent({
  emit,
  error: _error,
  planId,
  userId,
  getCorrelationId: getCorrelationIdOverride,
}: EmitCancelledEventParams): void {
  const requestId = (getCorrelationIdOverride ?? getCorrelationId)();
  logger.info({ planId, userId }, 'Generation stream cancelled');

  emit({
    type: 'cancelled',
    data: {
      planId,
      classification: 'cancelled',
      retryable: true,
      message: 'Plan generation was cancelled.',
      ...(requestId ? { requestId } : {}),
    },
  });
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
  const markSuccess =
    ctx.markPlanGenerationSuccess ?? markPlanGenerationSuccess;
  const modules = result.modules;
  const modulesCount = modules.length;
  const tasksCount = modules.reduce((sum, m) => sum + m.tasks.length, 0);

  emitModuleSummaries(modules, planId, emit);

  await markSuccess(planId, dbClient);
  await tryRecordUsage(userId, result, dbClient, {
    recordUsage: ctx.recordUsage,
  });

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
  const markFailure =
    ctx.markPlanGenerationFailure ?? markPlanGenerationFailure;

  const classification = result.classification ?? 'unknown';
  const retryable = isRetryableClassification(classification);

  if (!retryable) {
    await markFailure(planId, dbClient);
    await tryRecordUsage(userId, result, dbClient, {
      recordUsage: ctx.recordUsage,
    });
  }

  emitSanitizedFailureEvent({
    emit,
    error: result.error,
    classification,
    planId,
    userId,
    getCorrelationId: ctx.getCorrelationId,
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
  dbClient?: AttemptsDbClient,
  deps?: Pick<StreamingHelperDependencies, 'recordUsage'>
): Promise<void> {
  try {
    const usageRecorder = deps?.recordUsage ?? recordUsage;
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

    await usageRecorder(
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
 * Context for {@link withFallbackCleanup} used when logging primary/fallback errors.
 */
export interface WithFallbackCleanupContext {
  planId: string;
  attemptId: string;
  originalError: Error;
  messageFinalize: string;
  messageBoth: string;
}

/**
 * Runs primary cleanup; on failure runs fallback and logs. If fallback also fails,
 * logs both errors (finalizeErr, originalError, markFailedErr) with messageBoth.
 *
 * @param primary - Async cleanup to run first (e.g. finalizeAttemptFailure)
 * @param fallback - Async cleanup to run if primary throws (e.g. safeMarkPlanFailed)
 * @param context - planId, attemptId, normalized originalError (`Error`), and log messages
 */
export async function withFallbackCleanup(
  primary: () => Promise<void>,
  fallback: () => Promise<void>,
  context: WithFallbackCleanupContext
): Promise<void> {
  try {
    await primary();
  } catch (finalizeErr) {
    logger.error(
      {
        planId: context.planId,
        attemptId: context.attemptId,
        finalizeErr,
        originalError: context.originalError,
      },
      context.messageFinalize
    );
    try {
      await fallback();
    } catch (markFailedErr) {
      logger.error(
        {
          planId: context.planId,
          attemptId: context.attemptId,
          finalizeErr,
          attemptError: context.originalError,
          markFailedErr,
        },
        context.messageBoth
      );
    }
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
  dbClient: AttemptsDbClient = getDb(),
  deps?: Pick<StreamingHelperDependencies, 'markPlanGenerationFailure'>
): Promise<void> {
  try {
    const markFailure =
      deps?.markPlanGenerationFailure ?? markPlanGenerationFailure;
    await markFailure(planId, dbClient);
  } catch (markErr) {
    logger.error(
      { error: markErr, planId, userId },
      'Failed to mark plan as failed after generation error.'
    );
  }
}

interface ExecuteGenerationStreamParams {
  reqSignal: AbortSignal;
  streamSignal: AbortSignal;
  planId: string;
  userId: string;
  dbClient: AttemptsDbClient;
  emit: EmitFn;
  runGeneration: (signal: AbortSignal) => Promise<GenerationResult>;
  onUnhandledError: (error: unknown, startedAt: number) => Promise<void>;
  mapUnhandledErrorToClientError?: (
    error: unknown
  ) => GenerationError | ErrorLike;
  fallbackClassification?: FailureClassification | 'unknown';
}

function toFallbackErrorLike(error: unknown): ErrorLike {
  if (error instanceof Error) {
    const errorLike: ErrorLike = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    const cause = error.cause;
    if (
      cause === null ||
      typeof cause === 'string' ||
      cause instanceof Error ||
      (typeof cause === 'object' && cause !== null)
    ) {
      errorLike.cause = cause;
    }

    return errorLike;
  }

  return {
    name: 'UnknownGenerationError',
    message: String(error),
  };
}

export async function executeGenerationStream({
  reqSignal,
  streamSignal,
  planId,
  userId,
  dbClient,
  emit,
  runGeneration,
  onUnhandledError,
  mapUnhandledErrorToClientError,
  fallbackClassification = 'provider_error',
}: ExecuteGenerationStreamParams): Promise<void> {
  const startedAt = Date.now();
  const abortController = new AbortController();
  const cleanupRequestAbort = attachAbortListener(reqSignal, () =>
    abortController.abort()
  );
  const cleanupStreamAbort = attachAbortListener(streamSignal, () =>
    abortController.abort()
  );

  try {
    const result = await runGeneration(abortController.signal);

    if (result.status === 'success') {
      await handleSuccessfulGeneration(result, {
        planId,
        userId,
        dbClient,
        startedAt,
        emit,
      });
      return;
    }

    await handleFailedGeneration(result, {
      planId,
      userId,
      dbClient,
      emit,
    });
  } catch (error: unknown) {
    if (abortController.signal.aborted) {
      const clientError = mapUnhandledErrorToClientError
        ? mapUnhandledErrorToClientError(error)
        : toFallbackErrorLike(error);

      try {
        await onUnhandledError(error, startedAt);
      } catch (cleanupError) {
        logger.error(
          {
            cleanupError,
            planId,
            userId,
            sourceError: error,
          },
          'Failed cleanup after aborted generation stream'
        );
      }

      emitCancelledEvent({
        emit,
        error: clientError,
        planId,
        userId,
      });
      return;
    }

    const clientError = mapUnhandledErrorToClientError
      ? mapUnhandledErrorToClientError(error)
      : toFallbackErrorLike(error);

    try {
      await onUnhandledError(error, startedAt);
    } catch (cleanupError) {
      logger.error(
        {
          cleanupError,
          planId,
          userId,
          sourceError: error,
        },
        'Failed cleanup after generation stream error'
      );
    }

    emitSanitizedFailureEvent({
      emit,
      error: clientError,
      classification: fallbackClassification,
      planId,
      userId,
    });
  } finally {
    cleanupRequestAbort();
    cleanupStreamAbort();
  }
}
