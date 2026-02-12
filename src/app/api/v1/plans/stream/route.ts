import { attachAbortListener } from '@/lib/ai/abort';
import { resolveModelForTier } from '@/lib/ai/model-resolver';
import {
  runGenerationAttempt,
  type GenerationAttemptContext,
  type GenerationResult,
  type RunGenerationOptions,
} from '@/lib/ai/orchestrator';
import { createEventStream, streamHeaders } from '@/lib/ai/streaming/events';
import {
  withAuthAndRateLimit,
  withErrorBoundary,
  type PlainHandler,
} from '@/lib/api/auth';
import { AttemptCapExceededError, ValidationError } from '@/lib/api/errors';
import {
  preparePlanInputWithPdfOrigin,
  rollbackPdfUsageIfReserved,
} from '@/lib/api/plans/pdf-origin';
import {
  ensurePlanDurationAllowed,
  findCappedPlanWithoutModules,
  normalizePlanDurationForTier,
} from '@/lib/api/plans/shared';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { jsonError } from '@/lib/api/response';
import { getUserByAuthId } from '@/lib/db/queries/users';
import { getDb } from '@/lib/db/runtime';
import { logger } from '@/lib/logging/logger';
import type { SubscriptionTier } from '@/lib/stripe/tier-limits';
import { atomicCheckAndInsertPlan, resolveUserTier } from '@/lib/stripe/usage';
import type { CreateLearningPlanInput } from '@/lib/validation/learningPlans';
import { createLearningPlanSchema } from '@/lib/validation/learningPlans';
import { ZodError } from 'zod';
import {
  buildPlanStartEvent,
  emitSanitizedFailureEvent,
  handleFailedGeneration,
  handleSuccessfulGeneration,
  safeMarkPlanFailed,
} from './helpers';

/** Classification used when an unstructured exception occurs in the generation catch block. */
export const UNSTRUCTURED_EXCEPTION_CLASSIFICATION = 'provider_error' as const;

/** Retryable flag for unstructured exceptions (matches sanitizeSseError for provider_error). */
export const UNSTRUCTURED_EXCEPTION_RETRYABLE = true;

export interface StreamOrchestrator {
  runGenerationAttempt(
    context: GenerationAttemptContext,
    options: RunGenerationOptions
  ): Promise<GenerationResult>;
}

const defaultOrchestrator: StreamOrchestrator = {
  runGenerationAttempt,
};

/**
 * Creates the stream POST handler with an injectable orchestrator.
 * Used by integration tests to supply mocks; production uses the default orchestrator.
 */
export function createStreamHandler(deps?: {
  orchestrator?: StreamOrchestrator;
}): PlainHandler {
  const orchestrator = deps?.orchestrator ?? defaultOrchestrator;
  const runGen = orchestrator.runGenerationAttempt.bind(orchestrator);

  return withErrorBoundary(
    withAuthAndRateLimit('aiGeneration', async ({ req, userId }) => {
      let body: CreateLearningPlanInput;
      try {
        body = createLearningPlanSchema.parse(await req.json());
      } catch (error) {
        if (error instanceof ZodError) {
          throw new ValidationError('Invalid request body.', error.flatten());
        }
        throw new ValidationError('Invalid request body.', error);
      }

      const user = await getUserByAuthId(userId);
      if (!user) {
        throw new Error(
          'Authenticated user record missing despite provisioning.'
        );
      }

      const db = getDb();
      const { remaining } = await checkPlanGenerationRateLimit(user.id, db);
      const generationRateLimitHeaders =
        getPlanGenerationRateLimitHeaders(remaining);

      const userTier: SubscriptionTier = await resolveUserTier(user.id, db);
      const normalization = normalizePlanDurationForTier({
        tier: userTier,
        weeklyHours: body.weeklyHours,
        startDate: body.startDate ?? null,
        deadlineDate: body.deadlineDate ?? null,
      });
      const { startDate, deadlineDate, totalWeeks } = normalization;
      const cap = ensurePlanDurationAllowed({
        userTier,
        weeklyHours: body.weeklyHours,
        totalWeeks,
      });

      if (!cap.allowed) {
        return jsonError(cap.reason ?? 'Plan duration exceeds tier cap', {
          status: 403,
        });
      }

      const cappedPlanId = await findCappedPlanWithoutModules(user.id);
      if (cappedPlanId) {
        throw new AttemptCapExceededError('attempt cap reached', {
          planId: cappedPlanId,
        });
      }

      const preparedInput = await preparePlanInputWithPdfOrigin({
        body,
        authUserId: userId,
        internalUserId: user.id,
        dbClient: db,
      });

      if (!preparedInput.ok) {
        return preparedInput.response;
      }

      const {
        origin,
        extractedContext,
        topic,
        pdfUsageReserved,
        pdfProvenance,
      } = preparedInput.data;

      const generationInput = {
        topic,
        notes: body.notes ?? null,
        pdfContext: extractedContext,
        pdfExtractionHash: pdfProvenance?.extractionHash,
        pdfProofVersion: pdfProvenance?.proofVersion,
        skillLevel: body.skillLevel,
        weeklyHours: body.weeklyHours,
        learningStyle: body.learningStyle,
        startDate,
        deadlineDate,
      };

      let plan: { id: string };
      try {
        plan = await atomicCheckAndInsertPlan(
          user.id,
          {
            topic: generationInput.topic,
            skillLevel: generationInput.skillLevel,
            weeklyHours: generationInput.weeklyHours,
            learningStyle: generationInput.learningStyle,
            visibility: 'private',
            origin,
            extractedContext,
            startDate: generationInput.startDate,
            deadlineDate: generationInput.deadlineDate,
          },
          db
        );
      } catch (err) {
        if (pdfUsageReserved) {
          try {
            await rollbackPdfUsageIfReserved({
              internalUserId: user.id,
              dbClient: db,
              reserved: pdfUsageReserved,
            });
          } catch (rollbackErr) {
            logger.error(
              { rollbackErr, userId: user.id },
              'Failed to rollback pdf plan usage'
            );
          }
        }
        throw err;
      }

      // Tier-gated model selection via unified resolver.
      // Pass undefined when param is absent so resolver treats it as not_specified, not invalid_model.
      const url = new URL(req.url);
      const modelOverride = url.searchParams.has('model')
        ? url.searchParams.get('model')
        : undefined;
      const { provider } = resolveModelForTier(userTier, modelOverride);
      const normalizedInput: CreateLearningPlanInput = {
        ...body,
        startDate: generationInput.startDate ?? undefined,
        deadlineDate: generationInput.deadlineDate ?? undefined,
      };

      const stream = createEventStream(
        async (emit, _controller, streamContext) => {
          emit(
            buildPlanStartEvent({ planId: plan.id, input: normalizedInput })
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

          try {
            const result = await runGen(
              { planId: plan.id, userId: user.id, input: generationInput },
              { provider, signal: abortController.signal, dbClient: db }
            );

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
          } catch (error: unknown) {
            if (abortController.signal.aborted) {
              return;
            }
            await safeMarkPlanFailed(plan.id, user.id, db);
            emitSanitizedFailureEvent({
              emit,
              error:
                error instanceof Error
                  ? error
                  : { name: 'UnknownGenerationError', message: String(error) },
              classification: UNSTRUCTURED_EXCEPTION_CLASSIFICATION,
              planId: plan.id,
              userId: user.id,
            });
          } finally {
            cleanupRequestAbort();
            cleanupStreamAbort();
          }
        }
      );

      return new Response(stream, {
        status: 200,
        headers: {
          ...streamHeaders,
          ...generationRateLimitHeaders,
        },
      });
    })
  );
}

export const POST = createStreamHandler();
