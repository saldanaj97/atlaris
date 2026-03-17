import {
  buildPlanStartEvent,
  executeGenerationStream,
  safeMarkPlanFailed,
  withFallbackCleanup,
} from '@/app/api/v1/plans/stream/helpers';
import {
  PLAN_GENERATION_LIMIT,
  PLAN_GENERATION_WINDOW_MINUTES,
} from '@/features/ai/generation-policy';
import { ModelResolutionError } from '@/features/ai/model-resolution-error';
import { resolveModelForTier } from '@/features/ai/model-resolver';
import { runGenerationAttempt } from '@/features/ai/orchestrator';
import {
  createEventStream,
  streamHeaders,
} from '@/features/ai/streaming/events';
import type {
  GenerationInput,
  IsoDateString,
} from '@/features/ai/types/provider.types';
import { resolveUserTier } from '@/features/billing/usage';
import { parsePersistedPdfContext } from '@/features/pdf/context';
import {
  requireOwnedPlanById,
  requirePlanIdFromRequest,
} from '@/features/plans/api/route-context';
import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import {
  normalizeThrownError,
  toAttemptError,
} from '@/lib/api/error-normalization';
import { isFailureClassification } from '@/lib/api/error-response';
import { AppError, RateLimitError } from '@/lib/api/errors';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import {
  finalizeAttemptFailure,
  reserveAttemptSlot,
} from '@/lib/db/queries/attempts';
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

const extractFailureClassification = (
  error: unknown
): FailureClassification | undefined => {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const classification = (error as { classification?: unknown }).classification;
  if (
    typeof classification === 'string' &&
    isFailureClassification(classification)
  ) {
    return classification;
  }

  return undefined;
};

/**
 * POST /api/v1/plans/:planId/retry
 *
 * Retries generation for a failed plan. Returns a streaming response.
 * Attempt cap, failed-state requirement, and in-progress checks are enforced
 * atomically inside reserveAttemptSlot before streaming starts.
 */
export const POST = withErrorBoundary(
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

      // Tier-gated provider resolution (retries use default model for the tier)
      const userTier = await resolveUserTier(user.id, db);
      const { provider } = (() => {
        try {
          return resolveModelForTier(userTier);
        } catch (error) {
          if (error instanceof ModelResolutionError) {
            throw new AppError(error.message, {
              status: 500,
              code: error.code,
              details: error.details,
              headers: generationRateLimitHeaders,
            });
          }

          throw error;
        }
      })();

      // Build generation input from existing plan data
      const generationInput = {
        topic: plan.topic,
        // Notes are not stored on the plan currently
        notes: undefined,
        pdfContext:
          plan.origin === 'pdf'
            ? parsePersistedPdfContext(plan.extractedContext)
            : null,
        skillLevel: plan.skillLevel,
        weeklyHours: plan.weeklyHours,
        learningStyle: plan.learningStyle,
        startDate: toIsoDateString(plan.startDate),
        deadlineDate: toIsoDateString(plan.deadlineDate),
      } satisfies GenerationInput;

      // Atomically reserve an attempt slot before starting the stream so we can
      // return proper HTTP error codes for rejected attempts.
      const reservation = await reserveAttemptSlot({
        planId,
        userId: user.id,
        input: generationInput,
        dbClient: db,
        allowedGenerationStatuses: ['failed', 'pending_retry'],
      });

      if (!reservation.reserved) {
        switch (reservation.reason) {
          case 'capped':
            throw new AppError(
              'Maximum retry attempts reached for this plan. Please create a new plan.',
              {
                status: 429,
                code: 'ATTEMPTS_CAPPED',
                classification: 'capped',
                headers: generationRateLimitHeaders,
              }
            );
          case 'rate_limited':
            throw new RateLimitError(
              `Rate limit exceeded. Maximum ${PLAN_GENERATION_LIMIT} plan generation requests allowed per ${PLAN_GENERATION_WINDOW_MINUTES} minutes.`,
              { retryAfter: reservation.retryAfter, remaining: 0 },
              { headers: generationRateLimitHeaders }
            );
          case 'invalid_status':
            throw new AppError(
              "Plan is not eligible for retry. Only plans in 'failed' or 'pending_retry' may be retried.",
              {
                status: 400,
                code: 'VALIDATION_ERROR',
                classification: 'validation',
                headers: generationRateLimitHeaders,
              }
            );
          case 'in_progress':
            throw new AppError(
              'A generation is already in progress for this plan.',
              {
                status: 409,
                code: 'CONFLICT',
                classification: 'conflict',
                headers: generationRateLimitHeaders,
              }
            );
          default: {
            const unknownReason: never = reservation.reason;
            throw new AppError('Unexpected reservation failure reason.', {
              status: 500,
              code: 'UNKNOWN_RESERVATION_REASON',
              details: { reason: String(unknownReason) },
              headers: generationRateLimitHeaders,
            });
          }
        }
      }

      let stream: ReadableStream<Uint8Array>;
      try {
        stream = createEventStream(async (emit, _controller, streamContext) => {
          emit(
            buildPlanStartEvent({
              planId,
              input: {
                topic: generationInput.topic,
                skillLevel: generationInput.skillLevel,
                weeklyHours: generationInput.weeklyHours,
                learningStyle: generationInput.learningStyle,
                notes: generationInput.notes,
                startDate: generationInput.startDate ?? undefined,
                deadlineDate: generationInput.deadlineDate ?? undefined,
                visibility: 'private',
                origin: plan.origin ?? 'ai',
              },
            })
          );

          await executeGenerationStream({
            reqSignal: req.signal,
            streamSignal: streamContext.signal,
            planId: plan.id,
            userId: user.id,
            dbClient: db,
            emit,
            runGeneration: () =>
              runGenerationAttempt(
                {
                  planId: plan.id,
                  userId: user.id,
                  input: generationInput,
                },
                {
                  provider,
                  dbClient: db,
                  reservation,
                }
              ),
            onUnhandledError: async (attemptError, startedAt) => {
              const normalizedAttemptError = normalizeThrownError(attemptError);

              await withFallbackCleanup(
                async () => {
                  const classification =
                    extractFailureClassification(attemptError) ??
                    'provider_error';

                  await finalizeAttemptFailure({
                    attemptId: reservation.attemptId,
                    planId: plan.id,
                    preparation: reservation,
                    classification,
                    durationMs: Math.max(0, Date.now() - startedAt),
                    error: toAttemptError(normalizedAttemptError),
                    dbClient: db,
                  });
                },
                () => safeMarkPlanFailed(plan.id, user.id, db),
                {
                  planId: plan.id,
                  attemptId: reservation.attemptId,
                  originalError: normalizedAttemptError,
                  messageFinalize:
                    'Failed to finalize attempt on retry error; falling back to plan-level cleanup',
                  messageBoth:
                    'Plan-level cleanup (safeMarkPlanFailed) failed after finalize error',
                }
              );

              logger.error(
                {
                  planId: plan.id,
                  userId: user.id,
                  error: normalizedAttemptError,
                  stack: normalizedAttemptError.stack,
                },
                'Plan retry generation failed'
              );
            },
            mapUnhandledErrorToClientError: toAttemptError,
            fallbackClassification: 'provider_error',
          });
        });
      } catch (setupError) {
        await finalizeAttemptFailure({
          attemptId: reservation.attemptId,
          planId: plan.id,
          preparation: reservation,
          classification: 'provider_error',
          durationMs: 0,
          error: toAttemptError(setupError),
          dbClient: db,
        }).catch(async (finalizeErr) => {
          logger.error(
            {
              planId: plan.id,
              attemptId: reservation.attemptId,
              finalizeErr,
              setupError,
            },
            'Failed to finalize attempt after stream setup error'
          );
          await safeMarkPlanFailed(plan.id, user.id, db);
        });
        throw setupError;
      }

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
