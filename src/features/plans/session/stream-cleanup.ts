import type { ErrorLike } from '@/features/ai/streaming/error-sanitizer';
import type { PlanGenerationFailureMarker } from '@/features/plans/lifecycle/service';
import type { DbClient } from '@/lib/db/types';

import { markPlanGenerationFailure } from '@/features/plans/lifecycle/plan-persistence-store';
import {
  safeStringifyUnknown,
  unknownThrownCore,
} from '@/lib/errors/normalize-unknown';
import { logger } from '@/lib/logging/logger';
import { MissingRequestDbContextError } from '@supabase/runtime';

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
  persistence: PlanGenerationFailureMarker,
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

/**
 * Plan failure marking mutates server-owned plan state; pass serviceRoleDb from
 * feature-owned generation boundaries. Workers/tests may pass service-role or
 * other privileged clients matching their context.
 */
export async function safeMarkPlanFailedWithDbClient(
  planId: string,
  userId: string,
  dbClient: DbClient,
  deps?: SafeMarkPlanFailedDeps,
): Promise<void> {
  await safeMarkPlanFailed(
    planId,
    userId,
    {
      markGenerationFailure: (failedPlanId) =>
        markPlanGenerationFailure(failedPlanId, dbClient),
    },
    deps,
  );
}

function assignFallbackCause(errorLike: ErrorLike, cause: unknown): void {
  const extractedCause = maybeExtractCause(cause);
  if (extractedCause !== undefined) {
    errorLike.cause = extractedCause;
  }
}

function assignHttpFieldsFromObject(
  errorLike: ErrorLike,
  objectError: Record<string, unknown>,
): void {
  if (typeof objectError.status === 'number') {
    errorLike.status = objectError.status;
  }
  if (typeof objectError.statusCode === 'number') {
    errorLike.statusCode = objectError.statusCode;
  }
}

function assignResponseSummaryIfPresent(
  errorLike: ErrorLike,
  objectError: Record<string, unknown>,
): void {
  if (!('response' in objectError)) {
    return;
  }
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

function fallbackErrorLikeFromThrownObject(error: object): ErrorLike {
  const core = unknownThrownCore(error);
  const objectError = error as Record<string, unknown>;
  const errorLike: ErrorLike = {
    name: core.name ?? 'UnknownGenerationError',
    message:
      typeof objectError.message === 'string' && objectError.message.length > 0
        ? objectError.message
        : safeStringifyUnknown(error),
    ...(typeof core.stack === 'string' ? { stack: core.stack } : {}),
  };

  assignHttpFieldsFromObject(errorLike, objectError);
  assignResponseSummaryIfPresent(errorLike, objectError);
  assignFallbackCause(errorLike, core.cause);

  return errorLike;
}

function fallbackErrorLikeFromThrownNonObject(error: unknown): ErrorLike {
  const core = unknownThrownCore(error);
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

/** ErrorLike shape for SSE fallback when the thrown value is not already typed. */
export function toFallbackErrorLike(error: unknown): ErrorLike {
  if (typeof error === 'object' && error !== null) {
    return fallbackErrorLikeFromThrownObject(error);
  }

  return fallbackErrorLikeFromThrownNonObject(error);
}
