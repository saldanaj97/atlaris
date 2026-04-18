import { isRetryableClassification } from '@/features/ai/failures';
import type { GenerationResult } from '@/features/ai/types/orchestrator.types';
import { safeNormalizeUsage } from '@/features/ai/usage';
import { incrementUsage } from '@/features/billing/usage-metrics';
import {
  markPlanGenerationFailure,
  type markPlanGenerationSuccess,
} from '@/features/plans/lifecycle/plan-operations';
import type { getCorrelationId } from '@/lib/api/context';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import { canonicalUsageToRecordParams, recordUsage } from '@/lib/db/usage';
import { logger } from '@/lib/logging/logger';
import {
  emitSanitizedFailureEvent,
  type SessionEmitFn,
} from './stream-emitters';

interface StreamingHelperDependencies {
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
  emit: SessionEmitFn;
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

  const classification = result.classification ?? 'provider_error';
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

    // Keep this sequential: monthly plan usage should not increment if the
    // canonical usage record failed to persist.
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
