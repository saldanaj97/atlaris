import { eq } from 'drizzle-orm';

import { attachAbortListener } from '@/lib/ai/abort';
import {
  PLAN_GENERATION_LIMIT,
  PLAN_GENERATION_WINDOW_MINUTES,
} from '@/lib/ai/generation-policy';
import { resolveModelForTier } from '@/lib/ai/model-resolver';
import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { createEventStream, streamHeaders } from '@/lib/ai/streaming/events';
import type { GenerationInput, IsoDateString } from '@/lib/ai/types';
import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import {
  NotFoundError,
  RateLimitError,
  ValidationError,
} from '@/lib/api/errors';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { jsonError } from '@/lib/api/response';
import { getPlanIdFromUrl, isUuid } from '@/lib/api/route-helpers';
import {
  finalizeAttemptFailure,
  reserveAttemptSlot,
} from '@/lib/db/queries/attempts';
import { getUserByAuthId } from '@/lib/db/queries/users';
import { getDb } from '@/lib/db/runtime';
import { learningPlans } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
import { parsePersistedPdfContext } from '@/lib/pdf/context';
import { resolveUserTier } from '@/lib/stripe/usage';

import {
  buildPlanStartEvent,
  emitSanitizedFailureEvent,
  handleFailedGeneration,
  handleSuccessfulGeneration,
  safeMarkPlanFailed,
  withFallbackCleanup,
} from '@/app/api/v1/plans/stream/helpers';

export const maxDuration = 60;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toIsoDateString = (value: string | null): IsoDateString | undefined => {
  if (!value) {
    return undefined;
  }

  return ISO_DATE_PATTERN.test(value) ? (value as IsoDateString) : undefined;
};

interface AttemptErrorLike {
  message?: string;
  status?: number;
  statusCode?: number;
  httpStatus?: number;
}

function isAttemptErrorLike(obj: unknown): obj is AttemptErrorLike {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }
  const o = obj as AttemptErrorLike;
  if (o.message !== undefined && typeof o.message !== 'string') {
    return false;
  }
  if (o.status !== undefined && typeof o.status !== 'number') {
    return false;
  }
  if (o.statusCode !== undefined && typeof o.statusCode !== 'number') {
    return false;
  }
  if (o.httpStatus !== undefined && typeof o.httpStatus !== 'number') {
    return false;
  }
  return true;
}

type AttemptErrorResult = {
  message: string;
  status?: number;
  statusCode?: number;
  httpStatus?: number;
};

function toAttemptError(error: unknown): AttemptErrorResult {
  if (typeof error === 'string') {
    return { message: error };
  }

  if (error instanceof Error) {
    const errWithStatus = error as Error & AttemptErrorLike;
    const status =
      isAttemptErrorLike(error) && typeof errWithStatus.status === 'number'
        ? errWithStatus.status
        : undefined;
    const statusCode =
      isAttemptErrorLike(error) && typeof errWithStatus.statusCode === 'number'
        ? errWithStatus.statusCode
        : undefined;
    const httpStatus =
      isAttemptErrorLike(error) && typeof errWithStatus.httpStatus === 'number'
        ? errWithStatus.httpStatus
        : undefined;

    const result: AttemptErrorResult = { message: error.message };
    if (status !== undefined) result.status = status;
    if (statusCode !== undefined) result.statusCode = statusCode;
    if (httpStatus !== undefined) result.httpStatus = httpStatus;
    return result;
  }

  if (isAttemptErrorLike(error)) {
    const message =
      typeof error.message === 'string'
        ? error.message
        : 'Unknown retry generation error';
    const result: AttemptErrorResult = { message };
    if (typeof error.status === 'number') result.status = error.status;
    if (typeof error.statusCode === 'number')
      result.statusCode = error.statusCode;
    if (typeof error.httpStatus === 'number')
      result.httpStatus = error.httpStatus;
    return result;
  }

  return { message: 'Unknown retry generation error' };
}

/**
 * POST /api/v1/plans/:planId/retry
 *
 * Retries generation for a failed plan. Returns a streaming response.
 * Attempt cap, failed-state requirement, and in-progress checks are enforced
 * atomically inside reserveAttemptSlot before streaming starts.
 */
export const POST = withErrorBoundary(
  withAuthAndRateLimit('aiGeneration', async ({ req, userId }) => {
    const rawPlanId = getPlanIdFromUrl(req, 'second-to-last');
    if (!rawPlanId) {
      throw new ValidationError('Plan id is required in the request path.');
    }
    if (!isUuid(rawPlanId)) {
      throw new ValidationError('Invalid plan id format.');
    }
    // Re-assign to a const to ensure TypeScript narrows the type for closures
    const planId: string = rawPlanId;

    const user = await getUserByAuthId(userId);
    if (!user) {
      throw new NotFoundError(
        'Authenticated user record missing despite provisioning.'
      );
    }

    const db = getDb();

    // Fetch the plan
    const plan = await db.query.learningPlans.findFirst({
      where: eq(learningPlans.id, planId),
    });

    if (!plan) {
      throw new NotFoundError('Learning plan not found.');
    }

    // Verify ownership
    if (plan.userId !== user.id) {
      throw new NotFoundError('Learning plan not found.');
    }

    const { remaining } = await checkPlanGenerationRateLimit(user.id, db);
    const generationRateLimitHeaders =
      getPlanGenerationRateLimitHeaders(remaining);

    // Tier-gated provider resolution (retries use default model for the tier)
    const userTier = await resolveUserTier(user.id, db);
    const { provider } = resolveModelForTier(userTier);

    // Build generation input from existing plan data
    // Capture plan properties in local constants to satisfy TypeScript
    // Note: planId is already available from getPlanIdFromUrl and guaranteed non-null
    const planTopic = plan.topic;
    const planSkillLevel = plan.skillLevel;
    const planWeeklyHours = plan.weeklyHours;
    const planLearningStyle = plan.learningStyle;
    const planStartDate = plan.startDate;
    const planDeadlineDate = plan.deadlineDate;
    const planPdfContext =
      plan.origin === 'pdf'
        ? parsePersistedPdfContext(plan.extractedContext)
        : null;

    const generationInput: GenerationInput = {
      topic: planTopic,
      // Notes are not stored on the plan currently
      notes: undefined,
      pdfContext: planPdfContext,
      skillLevel: planSkillLevel,
      weeklyHours: planWeeklyHours,
      learningStyle: planLearningStyle,
      startDate: toIsoDateString(planStartDate),
      deadlineDate: toIsoDateString(planDeadlineDate),
    };

    // Atomically reserve an attempt slot before starting the stream so we can
    // return proper HTTP error codes for rejected attempts.
    const reservation = await reserveAttemptSlot({
      planId,
      userId: user.id,
      input: generationInput,
      dbClient: db,
      requiredGenerationStatus: 'failed',
    });

    if (!reservation.reserved) {
      if (reservation.reason === 'capped') {
        return jsonError(
          'Maximum retry attempts reached for this plan. Please create a new plan.',
          { status: 429, headers: generationRateLimitHeaders }
        );
      }
      if (reservation.reason === 'rate_limited') {
        throw new RateLimitError(
          `Rate limit exceeded. Maximum ${PLAN_GENERATION_LIMIT} plan generation requests allowed per ${PLAN_GENERATION_WINDOW_MINUTES} minutes.`,
          { retryAfter: reservation.retryAfter, remaining: 0 }
        );
      }
      if (reservation.reason === 'invalid_status') {
        return jsonError(
          'Plan is not in a failed state. Only failed plans can be retried.',
          { status: 400, headers: generationRateLimitHeaders }
        );
      }

      // reason === 'in_progress'
      return jsonError('A generation is already in progress for this plan.', {
        status: 409,
        headers: generationRateLimitHeaders,
      });
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
              notes: generationInput.notes ?? undefined,
              startDate: generationInput.startDate ?? undefined,
              deadlineDate: generationInput.deadlineDate ?? undefined,
              visibility: 'private',
              origin: plan.origin ?? 'ai',
            },
          })
        );

        const startedAt = Date.now();
        const abortController = new AbortController();
        const cleanupRequestAbort = attachAbortListener(req.signal, () =>
          abortController.abort()
        );
        const cleanupStreamAbort = attachAbortListener(
          streamContext.signal,
          () => abortController.abort()
        );

        let result: Awaited<ReturnType<typeof runGenerationAttempt>>;
        try {
          result = await runGenerationAttempt(
            {
              planId: plan.id,
              userId: user.id,
              input: generationInput,
            },
            {
              provider,
              signal: abortController.signal,
              dbClient: db,
              reservation,
            }
          );
        } catch (attemptError) {
          if (streamContext.signal.aborted) {
            return;
          }
          await withFallbackCleanup(
            () =>
              finalizeAttemptFailure({
                attemptId: reservation.attemptId,
                planId: plan.id,
                preparation: reservation,
                classification: 'provider_error',
                durationMs: Math.max(0, Date.now() - startedAt),
                error: toAttemptError(attemptError),
                dbClient: db,
              }),
            () => safeMarkPlanFailed(plan.id, user.id, db),
            {
              planId: plan.id,
              attemptId: reservation.attemptId,
              originalError: attemptError,
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
              error: attemptError,
              stack:
                attemptError instanceof Error ? attemptError.stack : undefined,
            },
            'Plan retry generation failed'
          );
          emitSanitizedFailureEvent({
            emit,
            error: attemptError,
            classification: 'provider_error',
            planId: plan.id,
            userId: user.id,
          });
          return;
        } finally {
          cleanupRequestAbort();
          cleanupStreamAbort();
        }

        if (result.status === 'success') {
          await handleSuccessfulGeneration(result, {
            planId: plan.id,
            userId: user.id,
            dbClient: db,
            startedAt,
            emit,
          });
          return;
        }

        await handleFailedGeneration(result, {
          planId: plan.id,
          userId: user.id,
          dbClient: db,
          emit,
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
  })
);
