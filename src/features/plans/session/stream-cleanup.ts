import type { ErrorLike } from '@/features/ai/streaming/error-sanitizer';
import type { PlanGenerationStatusPort } from '@/features/plans/lifecycle/ports';
import { MissingRequestDbContextError } from '@/lib/db/runtime';
import {
  safeStringifyUnknown,
  unknownThrownCore,
} from '@/lib/errors/normalize-unknown';
import { logger } from '@/lib/logging/logger';

/** Programming / wiring mistakes: surface instead of masking as persistence noise. */
function shouldSurfaceMarkFailureError(markErr: unknown): boolean {
  return (
    markErr instanceof TypeError ||
    markErr instanceof ReferenceError ||
    markErr instanceof MissingRequestDbContextError
  );
}

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

type SafeMarkPlanFailedDeps = {
  logger?: Pick<typeof logger, 'error'>;
};

/**
 * Safely mark a plan as failed, logging errors if marking fails.
 */
export async function safeMarkPlanFailed(
  planId: string,
  userId: string,
  persistence: PlanGenerationStatusPort,
  deps?: SafeMarkPlanFailedDeps,
): Promise<void> {
  const errorLogger = deps?.logger ?? logger;

  try {
    await persistence.markGenerationFailure(planId);
  } catch (markErr) {
    if (shouldSurfaceMarkFailureError(markErr)) {
      throw markErr;
    }
    errorLogger.error(
      {
        error: markErr,
        planId,
        userId,
        context: 'markGenerationFailure-after-generation-error',
      },
      'Failed to mark plan as failed after generation error (persistence path).',
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
