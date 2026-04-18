import {
  type ErrorLike,
  type GenerationError,
  sanitizeSseError,
} from '@/features/ai/streaming/error-sanitizer';
import type { ParsedModule } from '@/features/ai/types/parser.types';
import type { StreamingEvent } from '@/features/ai/types/streaming.types';
import type { GenerationAttemptResult } from '@/features/plans/lifecycle/types';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import { getCorrelationId } from '@/lib/api/context';
import { assertNever } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';
import type { FailureClassification } from '@/shared/types/client.types';
import { toFallbackErrorLike } from './stream-cleanup';

export type SessionEmitFn = (event: StreamingEvent) => void;

interface EmitSanitizedFailureEventParams {
  emit: SessionEmitFn;
  error: GenerationError | ErrorLike;
  classification: FailureClassification | 'unknown';
  planId: string;
  userId: string;
  getCorrelationId?: typeof getCorrelationId;
}

/**
 * Sanitizes a generation error and emits a client-safe SSE `error` event.
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
 * Emits module summaries and progress events for each parsed module.
 */
function emitModuleSummaries(
  modules: ParsedModule[],
  planId: string,
  emit: SessionEmitFn
): void {
  const modulesCount = modules.length;

  modules.forEach((module, index) => {
    const modulesParsed = index + 1;
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
        modulesParsed,
        modulesTotalHint: modulesCount,
        percent:
          modulesCount > 0
            ? Math.round((modulesParsed / modulesCount) * 100)
            : 0,
      },
    });
  });
}

/**
 * Build a 'plan_start' StreamingEvent from input and planId.
 */
export function buildPlanStartEvent({
  planId,
  attemptNumber,
  input,
}: {
  planId: string;
  attemptNumber: number;
  input: CreateLearningPlanInput;
}): StreamingEvent {
  return {
    type: 'plan_start',
    data: {
      planId,
      attemptNumber,
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

interface LifecycleGenerationStreamParams {
  reqSignal: AbortSignal;
  streamSignal: AbortSignal;
  planId: string;
  userId: string;
  emit: SessionEmitFn;
  processGeneration: () => Promise<GenerationAttemptResult>;
  onUnhandledError: (error: unknown, startedAt: number) => Promise<void>;
  fallbackClassification?: FailureClassification | 'unknown';
  getCorrelationId?: typeof getCorrelationId;
}

function getAbortReason(signal: AbortSignal): string | undefined {
  const reason = signal.reason;
  if (reason === undefined) {
    return undefined;
  }

  if (reason instanceof Error) {
    return reason.message || reason.name;
  }

  if (typeof reason === 'string') {
    return reason;
  }

  return String(reason);
}

function getCancellationReason(
  error: unknown,
  reqSignal: AbortSignal,
  streamSignal: AbortSignal
): string | undefined {
  if (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  ) {
    return error.message || error.name;
  }

  return getAbortReason(reqSignal) ?? getAbortReason(streamSignal);
}

/**
 * Execute the post-`plan_start` portion of a lifecycle-backed generation stream.
 *
 * Callers must emit `plan_start` before invoking this helper. That keeps the
 * persisted plan metadata/start handshake in one place and prevents duplicate
 * start events when retries or alternate lifecycle paths reuse this executor.
 *
 * Intended SSE flow:
 * - success: `plan_start` → zero or more `module_summary`/`progress` pairs →
 *   `complete`
 * - handled failure: `plan_start` → `error`
 * - unhandled failure with an attached client: `plan_start` → fallback `error`
 * - client disconnect or already-finalized attempt: `plan_start` may be the
 *   only event because completion/failure is recovered from persisted state
 */
export async function executeLifecycleGenerationStream({
  reqSignal,
  streamSignal,
  planId,
  userId,
  emit,
  processGeneration,
  onUnhandledError,
  fallbackClassification = 'provider_error',
  getCorrelationId: getCorrelationIdOverride,
}: LifecycleGenerationStreamParams): Promise<void> {
  const startedAt = Date.now();

  try {
    const result = await processGeneration();

    switch (result.status) {
      case 'generation_success': {
        const modules = result.data.modules;
        const modulesCount = modules.length;
        const tasksCount = modules.reduce((sum, m) => sum + m.tasks.length, 0);
        const totalMinutes = modules.reduce(
          (sum, module) => sum + module.estimatedMinutes,
          0
        );

        emitModuleSummaries(modules, planId, emit);

        emit({
          type: 'complete',
          data: {
            planId,
            modulesCount,
            tasksCount,
            totalMinutes,
          },
        });
        return;
      }

      case 'retryable_failure':
      case 'permanent_failure': {
        emitSanitizedFailureEvent({
          emit,
          error: result.error,
          classification: result.classification,
          planId,
          userId,
          getCorrelationId: getCorrelationIdOverride,
        });
        return;
      }

      case 'already_finalized': {
        logger.info(
          { planId, userId },
          'Generation attempt skipped: plan already finalized'
        );
        return;
      }

      default:
        assertNever(result);
    }
  } catch (error: unknown) {
    const clientDisconnectedBeforeCleanup =
      reqSignal.aborted || streamSignal.aborted;
    const cancellationReason = getCancellationReason(
      error,
      reqSignal,
      streamSignal
    );
    const clientError = toFallbackErrorLike(error);

    try {
      await onUnhandledError(error, startedAt);
    } catch (cleanupError) {
      logger.error(
        {
          cleanupError,
          planId,
          userId,
          sourceError: error,
          clientDisconnected: clientDisconnectedBeforeCleanup,
          cancellationReason,
        },
        'Failed cleanup after lifecycle generation stream error'
      );
    }

    const clientDisconnected =
      clientDisconnectedBeforeCleanup ||
      reqSignal.aborted ||
      streamSignal.aborted;

    if (clientDisconnected) {
      logger.info(
        { planId, userId, cancellationReason },
        'Client disconnected during generation; result saved to DB'
      );
      return;
    }

    emitSanitizedFailureEvent({
      emit,
      error: clientError,
      classification: fallbackClassification,
      planId,
      userId,
      getCorrelationId: getCorrelationIdOverride,
    });
  }
}
