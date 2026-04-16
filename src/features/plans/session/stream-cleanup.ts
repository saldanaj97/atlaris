import type { ErrorLike } from '@/features/ai/streaming/error-sanitizer';
import { markPlanGenerationFailure } from '@/features/plans/lifecycle/plan-operations';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import {
  safeStringifyUnknown,
  unknownThrownCore,
} from '@/lib/errors/normalize-unknown';
import { logger } from '@/lib/logging/logger';

function maybeExtractCause(value: unknown): ErrorLike['cause'] | undefined {
  if (
    value === null ||
    typeof value === 'string' ||
    value instanceof Error ||
    (typeof value === 'object' && value !== null)
  ) {
    return value;
  }

  return undefined;
}

export type SafeMarkPlanFailedDeps = {
  markPlanGenerationFailure?: typeof markPlanGenerationFailure;
  logger?: Pick<typeof logger, 'error'>;
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
  const errorLogger = deps?.logger ?? logger;

  try {
    const markFailure =
      deps?.markPlanGenerationFailure ?? markPlanGenerationFailure;
    await markFailure(planId, dbClient);
  } catch (markErr) {
    errorLogger.error(
      { error: markErr, planId, userId },
      'Failed to mark plan as failed after generation error.'
    );
  }
}

function assignFallbackCause(errorLike: ErrorLike, cause: unknown): void {
  const extractedCause = maybeExtractCause(cause);
  if (extractedCause !== undefined) {
    errorLike.cause = extractedCause;
  }
}

/** ErrorLike shape for SSE fallback when the thrown value is not already typed. */
export function toFallbackErrorLike(error: unknown): ErrorLike {
  const core = unknownThrownCore(error);

  if (typeof error === 'object' && error !== null) {
    const objectError = error as Record<string, unknown>;
    const errorLike: ErrorLike = {
      name: core.name ?? 'UnknownGenerationError',
      message:
        typeof objectError.message === 'string' &&
        objectError.message.length > 0
          ? objectError.message
          : safeStringifyUnknown(error),
      ...(typeof core.stack === 'string' ? { stack: core.stack } : {}),
    };

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

    assignFallbackCause(errorLike, core.cause);

    return errorLike;
  }

  const errorLike: ErrorLike = {
    name: core.name ?? 'UnknownGenerationError',
    message: core.primaryMessage,
  };

  if (typeof core.stack === 'string') {
    errorLike.stack = core.stack;
  }

  assignFallbackCause(errorLike, core.cause);

  return errorLike;
}
