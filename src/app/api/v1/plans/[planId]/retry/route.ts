import {
  buildPlanStartEvent,
  executeLifecycleGenerationStream,
  safeMarkPlanFailed,
} from '@/app/api/v1/plans/stream/helpers';
import {
  createEventStream,
  streamHeaders,
} from '@/features/ai/streaming/events';
import type { IsoDateString } from '@/features/ai/types/provider.types';
import { parsePersistedPdfContext } from '@/features/pdf/context';
import type { FailureClassification } from '@/shared/types/client.types';
import {
  requireOwnedPlanById,
  requirePlanIdFromRequest,
} from '@/features/plans/api/route-context';
import { resolveUserTier } from '@/features/billing/tier';
import { createPlanLifecycleService } from '@/features/plans/lifecycle';
import type {
  GenerationAttemptResult,
  JobQueuePort,
  ProcessGenerationInput,
} from '@/features/plans/lifecycle';
import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import type { PlainHandler } from '@/lib/api/auth';
import { AppError } from '@/lib/api/errors';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { getDb } from '@/lib/db/runtime';
import { logger } from '@/lib/logging/logger';

export const maxDuration = 60;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toIsoDateString = (value: string | null): IsoDateString | undefined => {
  if (!value) {
    return undefined;
  }

  return ISO_DATE_PATTERN.test(value) ? (value as IsoDateString) : undefined;
};

const RETRYABLE_STATUSES = new Set(['failed', 'pending_retry']);

/** Stub JobQueuePort — retry route does not enqueue jobs. */
const noopJobQueue: JobQueuePort = {
  async enqueueJob() {
    return '';
  },
  async completeJob() {},
  async failJob() {},
};

/**
 * Derives a {@link FailureClassification} from an unknown thrown value.
 * Falls back to `'provider_error'` when the error carries no recognisable classification.
 */
function classifyError(error: unknown): FailureClassification | 'unknown' {
  if (error instanceof AppError) {
    return error.classification() ?? 'provider_error';
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return 'timeout';
    }
  }
  return 'provider_error';
}

/**
 * Dependency injection interface for tests.
 * Tests can override `processGenerationAttempt` to inject mocked generation behavior.
 */
export interface RetryDependencyOverrides {
  processGenerationAttempt?: (
    input: ProcessGenerationInput
  ) => Promise<GenerationAttemptResult>;
}

/**
 * Creates the retry POST handler with optional dependency overrides.
 * Used by integration tests to supply mocks; production uses the default lifecycle service.
 */
export function createRetryHandler(deps?: {
  overrides?: RetryDependencyOverrides;
}): PlainHandler {
  return withErrorBoundary(
    withAuthAndRateLimit(
      'aiGeneration',
      async ({ req, user }): Promise<Response> => {
        const planId = requirePlanIdFromRequest(req, 'second-to-last');

        const db = getDb();
        const rateLimit = await checkPlanGenerationRateLimit(user.id, db);
        const generationRateLimitHeaders =
          getPlanGenerationRateLimitHeaders(rateLimit);

        const plan = await requireOwnedPlanById({
          planId,
          ownerUserId: user.id,
          dbClient: db,
        });

        // Pre-flight: reject non-retryable plan statuses with a clear HTTP error
        if (!RETRYABLE_STATUSES.has(plan.generationStatus ?? '')) {
          throw new AppError(
            "Plan is not eligible for retry. Only plans in 'failed' or 'pending_retry' may be retried.",
            {
              status: 400,
              code: 'VALIDATION_ERROR',
              classification: 'validation',
              headers: generationRateLimitHeaders,
            }
          );
        }

        // Resolve tier for ProcessGenerationInput (lifecycle service handles model selection internally)
        const tier = await resolveUserTier(user.id, db);

        const lifecycleService = createPlanLifecycleService({
          dbClient: db,
          attemptsDbClient: db,
          jobQueue: noopJobQueue,
        });

        // Build generation input from existing plan data
        const pdfContext =
          plan.origin === 'pdf'
            ? parsePersistedPdfContext(plan.extractedContext)
            : null;

        const generationInput: ProcessGenerationInput = {
          planId: plan.id,
          userId: user.id,
          tier,
          input: {
            topic: plan.topic,
            notes: undefined,
            pdfContext,
            skillLevel: plan.skillLevel,
            weeklyHours: plan.weeklyHours,
            learningStyle: plan.learningStyle,
            startDate: toIsoDateString(plan.startDate),
            deadlineDate: toIsoDateString(plan.deadlineDate),
          },
        };

        // Resolve the processGeneration function (allow test override)
        const processGeneration =
          deps?.overrides?.processGenerationAttempt ??
          lifecycleService.processGenerationAttempt.bind(lifecycleService);

        // ─── SSE stream (lifecycle service owns attempt management) ───
        const stream = createEventStream(
          async (emit, _controller, streamContext) => {
            emit(
              buildPlanStartEvent({
                planId,
                input: {
                  topic: plan.topic,
                  skillLevel: plan.skillLevel,
                  weeklyHours: plan.weeklyHours,
                  learningStyle: plan.learningStyle,
                  notes: undefined,
                  startDate: toIsoDateString(plan.startDate),
                  deadlineDate: toIsoDateString(plan.deadlineDate),
                  visibility: 'private',
                  origin: plan.origin ?? 'ai',
                },
              })
            );

            await executeLifecycleGenerationStream({
              reqSignal: req.signal,
              streamSignal: streamContext.signal,
              planId: plan.id,
              userId: user.id,
              emit,
              processGeneration: () => processGeneration(generationInput),
              onUnhandledError: async (error, startedAt) => {
                const classification = classifyError(error);
                logger.error(
                  {
                    planId: plan.id,
                    userId: user.id,
                    classification,
                    durationMs: Math.max(0, Date.now() - startedAt),
                    error:
                      error instanceof Error
                        ? {
                            name: error.name,
                            message: error.message,
                            stack: error.stack,
                          }
                        : { value: String(error) },
                  },
                  'Unhandled exception during retry generation; marking plan failed'
                );

                await safeMarkPlanFailed(plan.id, user.id, db);
              },
              fallbackClassification: 'provider_error',
            });
          }
        );

        return new Response(stream, {
          status: 200,
          headers: {
            ...streamHeaders,
            ...generationRateLimitHeaders,
          },
        });
      }
    )
  );
}

/**
 * POST /api/v1/plans/:planId/retry
 *
 * Retries generation for a failed plan. Returns a streaming response.
 * Delegates to PlanLifecycleService for attempt management, generation,
 * failure marking, and usage recording. The route is a thin adapter that
 * handles HTTP-level validation (ownership, plan status) and SSE streaming.
 */
export const POST = createRetryHandler();
