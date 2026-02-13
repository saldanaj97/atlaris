import { AVAILABLE_MODELS } from '@/lib/ai/ai-models';
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
import { ValidationError } from '@/lib/api/errors';
import {
  insertPlanWithRollback,
  preparePlanCreationPreflight,
} from '@/lib/api/plans/preflight';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { getDb } from '@/lib/db/runtime';
import { logger } from '@/lib/logging/logger';
import type { CreateLearningPlanInput } from '@/lib/validation/learningPlans';
import { createLearningPlanSchema } from '@/lib/validation/learningPlans';
import { ZodError } from 'zod';
import {
  buildPlanStartEvent,
  executeGenerationStream,
  safeMarkPlanFailed,
} from './helpers';

/** Classification used when an unstructured exception occurs in the generation catch block. */
export const UNSTRUCTURED_EXCEPTION_CLASSIFICATION = 'provider_error' as const;

export interface StreamOrchestrator {
  runGenerationAttempt(
    context: GenerationAttemptContext,
    options: RunGenerationOptions
  ): Promise<GenerationResult>;
}

const defaultOrchestrator: StreamOrchestrator = {
  runGenerationAttempt,
};

const ALLOWED_MODELS = new Set(AVAILABLE_MODELS.map((model) => model.id));

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
      logger.info({ authUserId: userId }, 'Plan stream handler entered');

      let body: CreateLearningPlanInput;
      try {
        const parsedBody = await req.json();
        logger.info(
          {
            authUserId: userId,
            payload: toPayloadLog(parsedBody),
          },
          'Plan stream request payload received'
        );
        body = createLearningPlanSchema.parse(parsedBody);
      } catch (error) {
        if (error instanceof ZodError) {
          logger.warn(
            {
              authUserId: userId,
              validation: error.flatten(),
            },
            'Plan stream request failed schema validation'
          );
          throw new ValidationError('Invalid request body.', error.flatten());
        }
        logger.error(
          {
            authUserId: userId,
            error: serializeError(error),
          },
          'Plan stream request body parsing failed'
        );
        throw new ValidationError('Invalid request body.', {
          reason: 'Malformed or invalid JSON payload.',
        });
      }

      const db = getDb();

      logger.info({ authUserId: userId }, 'Running plan creation preflight');
      const preflight = await preparePlanCreationPreflight({
        body,
        authUserId: userId,
        dbClient: db,
      });

      if (!preflight.ok) {
        logger.warn(
          {
            authUserId: userId,
            status: preflight.response.status,
          },
          'Plan creation preflight rejected request'
        );
        return preflight.response;
      }

      const {
        user,
        userTier,
        startDate,
        deadlineDate,
        preparedInput: { extractedContext, topic, pdfProvenance },
      } = preflight.data;

      const { remaining } = await checkPlanGenerationRateLimit(user.id, db);
      const generationRateLimitHeaders =
        getPlanGenerationRateLimitHeaders(remaining);

      const generationInput = {
        topic,
        notes: body.notes ?? null,
        pdfContext: extractedContext,
        pdfExtractionHash: pdfProvenance?.extractionHash,
        pdfProofVersion: pdfProvenance?.proofVersion,
        skillLevel: body.skillLevel,
        weeklyHours: body.weeklyHours,
        learningStyle: body.learningStyle,
        startDate: startDate ?? undefined,
        deadlineDate: deadlineDate ?? undefined,
      };

      logger.info(
        {
          authUserId: userId,
          userId: user.id,
        },
        'Inserting plan before streaming generation'
      );
      const plan = await insertPlanWithRollback({
        body,
        preflight: preflight.data,
        dbClient: db,
      });
      logger.info(
        {
          planId: plan.id,
          userId: user.id,
          authUserId: userId,
        },
        'Plan insert succeeded for streaming generation'
      );

      // Tier-gated model selection via unified resolver.
      // Pass undefined when param is absent or invalid so resolver treats it as not_specified.
      const url = new URL(req.url);
      let modelOverride: string | undefined;
      if (url.searchParams.has('model')) {
        const suppliedModel = url.searchParams.get('model');
        const isAllowedModel =
          typeof suppliedModel === 'string' &&
          ALLOWED_MODELS.has(suppliedModel);

        logger.info(
          {
            authUserId: userId,
            userId: user.id,
            suppliedModelOverride: suppliedModel,
            isValidOverride: isAllowedModel,
          },
          'Model override provided for stream generation'
        );

        if (isAllowedModel) {
          modelOverride = suppliedModel;
        } else {
          logger.warn(
            {
              authUserId: userId,
              userId: user.id,
              suppliedModelOverride: suppliedModel,
            },
            'Ignoring invalid model override for stream generation'
          );
          modelOverride = undefined;
        }
      }
      const { provider } = resolveModelForTier(userTier, modelOverride);
      const normalizedInput: CreateLearningPlanInput = {
        ...body,
        startDate: generationInput.startDate,
        deadlineDate: generationInput.deadlineDate,
      };

      const stream = createEventStream(
        async (emit, _controller, streamContext) => {
          logger.info(
            { planId: plan.id, userId: user.id },
            'Building plan_start event'
          );
          const planStartEvent = buildPlanStartEvent({
            planId: plan.id,
            input: normalizedInput,
          });
          logger.info(
            { planId: plan.id, userId: user.id },
            'Emitting plan_start event'
          );
          emit(planStartEvent);

          logger.info(
            { planId: plan.id, userId: user.id },
            'Starting executeGenerationStream'
          );
          await executeGenerationStream({
            reqSignal: req.signal,
            streamSignal: streamContext.signal,
            planId: plan.id,
            userId: user.id,
            dbClient: db,
            emit,
            runGeneration: async (signal) => {
              logger.info(
                { planId: plan.id, userId: user.id },
                'Starting generation attempt'
              );
              const result = await runGen(
                {
                  planId: plan.id,
                  userId: user.id,
                  input: generationInput,
                },
                { provider, signal, dbClient: db }
              );
              logger.info(
                {
                  planId: plan.id,
                  userId: user.id,
                  status: result.status,
                  classification: result.classification ?? null,
                },
                'Generation attempt completed'
              );
              return result;
            },
            onUnhandledError: async (error, startedAt) => {
              logger.error(
                {
                  planId: plan.id,
                  userId: user.id,
                  classification: UNSTRUCTURED_EXCEPTION_CLASSIFICATION,
                  durationMs: Math.max(0, Date.now() - startedAt),
                  error: serializeError(error),
                },
                'Unhandled exception during stream generation; marking plan failed'
              );

              logger.warn(
                { planId: plan.id, userId: user.id },
                'Calling safeMarkPlanFailed after unhandled stream error'
              );
              await safeMarkPlanFailed(plan.id, user.id, db);
              logger.info(
                { planId: plan.id, userId: user.id },
                'safeMarkPlanFailed completed after unhandled stream error'
              );
            },
            fallbackClassification: UNSTRUCTURED_EXCEPTION_CLASSIFICATION,
          });
          logger.info(
            { planId: plan.id, userId: user.id },
            'executeGenerationStream completed'
          );
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

function toPayloadLog(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') {
    return { payloadType: typeof payload };
  }

  const maybePayload = payload as Partial<CreateLearningPlanInput> & {
    notes?: unknown;
    extractedContent?: unknown;
  };

  return {
    topic: typeof maybePayload.topic === 'string' ? maybePayload.topic : null,
    skillLevel:
      typeof maybePayload.skillLevel === 'string'
        ? maybePayload.skillLevel
        : null,
    weeklyHours:
      typeof maybePayload.weeklyHours === 'number'
        ? maybePayload.weeklyHours
        : null,
    learningStyle:
      typeof maybePayload.learningStyle === 'string'
        ? maybePayload.learningStyle
        : null,
    visibility:
      typeof maybePayload.visibility === 'string'
        ? maybePayload.visibility
        : null,
    origin:
      typeof maybePayload.origin === 'string' ? maybePayload.origin : null,
    hasNotes:
      typeof maybePayload.notes === 'string' && maybePayload.notes.length > 0,
    hasExtractedContent:
      typeof maybePayload.extractedContent === 'object' &&
      maybePayload.extractedContent !== null,
  };
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    value: String(error),
  };
}
