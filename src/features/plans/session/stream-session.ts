import {
  type ErrorLike,
  type GenerationError,
  sanitizeSseError,
} from '@/features/ai/streaming/error-sanitizer';
import type { ParsedModule } from '@/features/ai/types/parser.types';
import type { StreamingEvent } from '@/features/ai/types/streaming.types';
import { markPlanGenerationFailure } from '@/features/plans/lifecycle';
import type { GenerationAttemptResult } from '@/features/plans/lifecycle/types';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import { getCorrelationId } from '@/lib/api/context';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import { assertNever } from '@/lib/errors';
import { safeStringifyUnknown } from '@/lib/errors/normalize-unknown';
import { logger } from '@/lib/logging/logger';
import type { FailureClassification } from '@/shared/types/client.types';

type EmitFn = (event: StreamingEvent) => void;

function maybeExtractCause(
  value: Pick<Error, 'cause'> | Record<string, unknown>
): ErrorLike['cause'] | undefined {
  const cause = value.cause;

  if (
    cause === null ||
    typeof cause === 'string' ||
    cause instanceof Error ||
    (typeof cause === 'object' && cause !== null)
  ) {
    return cause;
  }

  return undefined;
}

interface EmitSanitizedFailureEventParams {
  emit: EmitFn;
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
export function emitModuleSummaries(
  modules: ParsedModule[],
  planId: string,
  emit: EmitFn
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

export type SafeMarkPlanFailedDeps = {
  markPlanGenerationFailure?: typeof markPlanGenerationFailure;
};

/**
 * Safely mark a plan as failed, logging errors if marking fails.
 */
export async function safeMarkPlanFailed(
  planId: string,
  userId: string,
  dbClient: AttemptsDbClient,
  deps?: SafeMarkPlanFailedDeps
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

/** ErrorLike shape for SSE fallback when the thrown value is not already typed. */
export function toFallbackErrorLike(error: unknown): ErrorLike {
  if (error instanceof Error) {
    const errorLike: ErrorLike = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    const cause = maybeExtractCause(error);
    if (cause !== undefined) {
      errorLike.cause = cause;
    }

    return errorLike;
  }

  if (typeof error === 'object' && error !== null) {
    const objectError = error as Record<string, unknown>;
    const errorLike: ErrorLike = {
      name:
        typeof objectError.name === 'string' && objectError.name.length > 0
          ? objectError.name
          : 'UnknownGenerationError',
      message:
        typeof objectError.message === 'string' &&
        objectError.message.length > 0
          ? objectError.message
          : safeStringifyUnknown(error),
    };

    if (typeof objectError.stack === 'string') {
      errorLike.stack = objectError.stack;
    }
    if (typeof objectError.status === 'number') {
      errorLike.status = objectError.status;
    }
    if (typeof objectError.statusCode === 'number') {
      errorLike.statusCode = objectError.statusCode;
    }
    if ('response' in objectError) {
      const response = objectError.response;
      if (response === null) {
        errorLike.response = null;
      } else if (typeof response === 'object' && response !== null) {
        const responseRecord = response as Record<string, unknown>;
        errorLike.response =
          typeof responseRecord.status === 'number'
            ? { status: responseRecord.status }
            : {};
      }
    }

    const cause = maybeExtractCause(objectError);
    if (cause !== undefined) {
      errorLike.cause = cause;
    }

    return errorLike;
  }

  return {
    name: 'UnknownGenerationError',
    message: String(error),
  };
}

export interface LifecycleGenerationStreamParams {
  reqSignal: AbortSignal;
  streamSignal: AbortSignal;
  planId: string;
  userId: string;
  emit: EmitFn;
  processGeneration: () => Promise<GenerationAttemptResult>;
  onUnhandledError: (error: unknown, startedAt: number) => Promise<void>;
  fallbackClassification?: FailureClassification | 'unknown';
  getCorrelationId?: typeof getCorrelationId;
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
    const clientDisconnected = reqSignal.aborted || streamSignal.aborted;

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
          clientDisconnected,
        },
        'Failed cleanup after lifecycle generation stream error'
      );
    }

    if (clientDisconnected) {
      logger.info(
        { planId, userId },
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
