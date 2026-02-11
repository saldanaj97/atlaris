import { eq } from 'drizzle-orm';

import { resolveModelForTier } from '@/lib/ai/model-resolver';
import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { createEventStream, streamHeaders } from '@/lib/ai/streaming/events';
import type { GenerationInput, IsoDateString } from '@/lib/ai/types';
import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
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
  handleFailedGeneration,
  handleSuccessfulGeneration,
  safeMarkPlanFailed,
} from '@/app/api/v1/plans/stream/helpers';

export const maxDuration = 60;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toIsoDateString = (value: string | null): IsoDateString | undefined => {
  if (!value) {
    return undefined;
  }

  return ISO_DATE_PATTERN.test(value) ? (value as IsoDateString) : undefined;
};

/**
 * POST /api/v1/plans/:planId/retry
 *
 * Retries generation for a failed plan. Returns a streaming response.
 * Attempt cap and in-progress checks are enforced atomically inside
 * reserveAttemptSlot (called by runGenerationAttempt).
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

    // Check if plan is in a failed state (only allow retry for failed plans)
    if (plan.generationStatus !== 'failed') {
      return jsonError(
        'Plan is not in a failed state. Only failed plans can be retried.',
        { status: 400 }
      );
    }

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
    });

    if (!reservation.reserved) {
      if (reservation.reason === 'capped') {
        return jsonError(
          'Maximum retry attempts reached for this plan. Please create a new plan.',
          { status: 429 }
        );
      }
      // reason === 'in_progress'
      return jsonError('A generation is already in progress for this plan.', {
        status: 409,
      });
    }

    let stream: ReadableStream<Uint8Array>;
    try {
      stream = createEventStream(async (emit) => {
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

        let result;
        try {
          result = await runGenerationAttempt(
            {
              planId: plan.id,
              userId: user.id,
              input: generationInput,
            },
            { provider, signal: req.signal, dbClient: db, reservation }
          );
        } catch (attemptError) {
          await finalizeAttemptFailure({
            attemptId: reservation.attemptId,
            planId: plan.id,
            preparation: reservation,
            classification: 'provider_error',
            durationMs: Math.max(0, Date.now() - startedAt),
            error: attemptError,
            dbClient: db,
          }).catch((finalizeErr) => {
            logger.error(
              {
                planId: plan.id,
                attemptId: reservation.attemptId,
                finalizeErr,
                originalError: attemptError,
              },
              'Failed to finalize attempt on retry error; falling back to plan-level cleanup'
            );
            return safeMarkPlanFailed(plan.id, user.id);
          });
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
          throw attemptError;
        }

        if (result.status === 'success') {
          await handleSuccessfulGeneration(result, {
            planId: plan.id,
            userId: user.id,
            startedAt,
            emit,
          });
          return;
        }

        await handleFailedGeneration(result, {
          planId: plan.id,
          userId: user.id,
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
        error: setupError,
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
        await safeMarkPlanFailed(plan.id, user.id);
      });
      throw setupError;
    }

    return new Response(stream, {
      status: 200,
      headers: streamHeaders,
    });
  })
);
