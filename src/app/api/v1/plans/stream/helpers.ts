import { isRetryableClassification } from '@/features/ai/failures';
import type {
  ErrorLike,
  GenerationError,
} from '@/features/ai/streaming/error-sanitizer';
import type { GenerationResult } from '@/features/ai/types/orchestrator.types';
import type { StreamingEvent } from '@/features/ai/types/streaming.types';
import { safeNormalizeUsage } from '@/features/ai/usage';
import { incrementUsage } from '@/features/billing/usage-metrics';
import {
  markPlanGenerationFailure,
  markPlanGenerationSuccess,
} from '@/features/plans/lifecycle';
import {
  emitModuleSummaries,
  emitSanitizedFailureEvent,
} from '@/features/plans/session/stream-session';
import { getCorrelationId } from '@/lib/api/context';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import { canonicalUsageToRecordParams, recordUsage } from '@/lib/db/usage';
import { logger } from '@/lib/logging/logger';

export type { LifecycleGenerationStreamParams } from '@/features/plans/session/stream-session';
export {
  buildPlanStartEvent,
  executeLifecycleGenerationStream,
  safeMarkPlanFailed,
  toFallbackErrorLike,
} from '@/features/plans/session/stream-session';

type EmitFn = (event: StreamingEvent) => void;

export interface StreamingHelperDependencies {
  markPlanGenerationFailure?: typeof markPlanGenerationFailure;
  markPlanGenerationSuccess?: typeof markPlanGenerationSuccess;
  recordUsage?: typeof recordUsage;
  incrementUsage?: typeof incrementUsage;
  canonicalUsageToRecordParams?: typeof canonicalUsageToRecordParams;
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

interface EmitCancelledEventParams {
  emit: EmitFn;
  error: GenerationError | ErrorLike;
  planId: string;
  userId: string;
  getCorrelationId?: typeof getCorrelationId;
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
  const { planId, userId, emit, dbClient } = ctx;
  const markSuccess =
    ctx.markPlanGenerationSuccess ?? markPlanGenerationSuccess;
  const modules = result.modules;
  const modulesCount = modules.length;
  const tasksCount = modules.reduce((sum, m) => sum + m.tasks.length, 0);
  const totalMinutes = modules.reduce(
    (sum, module) => sum + module.estimatedMinutes,
    0
  );

  emitModuleSummaries(modules, planId, emit);

  await markSuccess(planId, dbClient);
  await tryRecordUsage(userId, result, dbClient, {
    recordUsage: ctx.recordUsage,
    incrementUsage: ctx.incrementUsage,
    canonicalUsageToRecordParams: ctx.canonicalUsageToRecordParams,
  });

  emit({
    type: 'complete',
    data: {
      planId,
      modulesCount,
      tasksCount,
      totalMinutes,
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

  await markFailure(planId, dbClient);

  if (!retryable) {
    await tryRecordUsage(userId, result, dbClient, {
      recordUsage: ctx.recordUsage,
      incrementUsage: ctx.incrementUsage,
      canonicalUsageToRecordParams: ctx.canonicalUsageToRecordParams,
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
 * Attempts to record usage information from generation metadata.
 * Normalizes raw provider metadata into canonical usage shape.
 * Errors are logged but do not throw.
 *
 * @param userId - ID of the user to associate usage with
 * @param result - GenerationResult containing metadata and usage information
 */
export async function tryRecordUsage(
  userId: string,
  result: GenerationResult,
  dbClient: AttemptsDbClient,
  deps?: Pick<
    StreamingHelperDependencies,
    'recordUsage' | 'incrementUsage' | 'canonicalUsageToRecordParams'
  >
): Promise<void> {
  try {
    const usageRecorder = deps?.recordUsage ?? recordUsage;
    const usageIncrementer = deps?.incrementUsage ?? incrementUsage;
    const toRecordParams =
      deps?.canonicalUsageToRecordParams ?? canonicalUsageToRecordParams;

    const canonical = safeNormalizeUsage(result.metadata);

    await usageRecorder(toRecordParams(canonical, userId), dbClient);

    await usageIncrementer(userId, 'plan', dbClient);
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
