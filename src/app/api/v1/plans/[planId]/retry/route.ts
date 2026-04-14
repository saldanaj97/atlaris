import type { IsoDateString } from '@/features/ai/types/provider.types';
import { resolveUserTier } from '@/features/billing/tier';
import { parsePersistedPdfContext } from '@/features/pdf/context';
import {
  requireOwnedPlanById,
  requirePlanIdFromRequest,
} from '@/features/plans/api/route-context';
import type {
  GenerationAttemptResult,
  JobQueuePort,
  ProcessGenerationInput,
} from '@/features/plans/lifecycle';
import { createPlanLifecycleService } from '@/features/plans/lifecycle';
import {
  createPlanGenerationSessionResponse,
  createStreamDbClient,
} from '@/features/plans/session/server-session';
import { safeMarkPlanFailed } from '@/features/plans/session/stream-session';
import type { PlainHandler } from '@/lib/api/auth';
import { withAuthAndRateLimit } from '@/lib/api/auth';
import { AppError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { getPlanAttemptsForUser } from '@/lib/db/queries/plans';
import { getDb } from '@/lib/db/runtime';
import { logger } from '@/lib/logging/logger';
import type { FailureClassification } from '@/shared/types/client.types';

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
        const attemptsSnapshot = await getPlanAttemptsForUser(
          plan.id,
          user.id,
          db
        );
        const attemptNumber = (attemptsSnapshot?.attempts.length ?? 0) + 1;

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

        const { dbClient: streamDb, cleanup: cleanupStreamDb } =
          await createStreamDbClient(user.id);
        let streamDbClosed = false;
        const closeStreamDb = async (): Promise<void> => {
          if (streamDbClosed) return;
          streamDbClosed = true;
          try {
            await cleanupStreamDb();
          } catch (error) {
            logger.error(
              { userId: user.id, error },
              'Failed to close stream DB client'
            );
          }
        };

        const lifecycleService = createPlanLifecycleService({
          dbClient: streamDb,
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

        return await createPlanGenerationSessionResponse({
          req,
          authUserId: user.id,
          dbClient: streamDb,
          cleanup: closeStreamDb,
          planId,
          attemptNumber,
          planStartInput: {
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
          generationInput,
          processGeneration,
          onUnhandledError: async (
            error: unknown,
            startedAt: number,
            dbClient
          ) => {
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

            await safeMarkPlanFailed(plan.id, user.id, dbClient);
          },
          fallbackClassification: 'provider_error',
          headers: generationRateLimitHeaders,
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
