import { isRetryableClassification } from '@/features/ai/failures';
import type { GenerationResult } from '@/features/ai/types/orchestrator.types';
import { safeNormalizeUsage } from '@/features/ai/usage';
import type {
  PlanGenerationStatusPort,
  UsageRecordingPort,
} from '@/features/plans/lifecycle/ports';
import type { getCorrelationId } from '@/lib/api/context';
import { logger } from '@/lib/logging/logger';
import {
  emitSanitizedFailureEvent,
  type SessionEmitFn,
} from './stream-emitters';

interface StreamingHelperDependencies {
  getCorrelationId?: typeof getCorrelationId;
}

interface GenerationContext extends StreamingHelperDependencies {
  planId: string;
  userId: string;
  persistence: PlanGenerationStatusPort;
  usageRecording: UsageRecordingPort;
  emit: SessionEmitFn;
}

/**
 * Handle a failed plan generation result.
 * Determines if the failure is retryable, marks the plan as failed and records usage when not retryable,
 * and emits an 'error' event with classification and retryable flag.
 */
export async function handleFailedGeneration(
  result: Extract<GenerationResult, { status: 'failure' }>,
  ctx: GenerationContext
): Promise<void> {
  const { planId, userId, emit, persistence } = ctx;

  const classification = result.classification ?? 'provider_error';
  const retryable = isRetryableClassification(classification);

  await persistence.markGenerationFailure(planId);

  if (!retryable) {
    await tryRecordUsage(userId, result, ctx.usageRecording);
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
 */
export async function tryRecordUsage(
  userId: string,
  result: GenerationResult,
  usageRecording: UsageRecordingPort
): Promise<void> {
  try {
    const canonical = safeNormalizeUsage(result.metadata);

    await usageRecording.recordUsage({
      userId,
      usage: canonical,
      kind: 'plan',
    });
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
