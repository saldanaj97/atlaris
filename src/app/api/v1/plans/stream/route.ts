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
import { requireInternalUserByAuthId } from '@/lib/api/plans/route-context';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { appEnv } from '@/lib/config/env';
import { getDb } from '@/lib/db/runtime';
import { logger } from '@/lib/logging/logger';
import type { CreateLearningPlanInput } from '@/lib/validation/learningPlans';
import { createLearningPlanSchema } from '@/lib/validation/learningPlans';
import { ZodError } from 'zod';
import {
  buildPlanStartEvent,
  executeGenerationStream,
  safeMarkPlanFailed,
  serializeError,
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
        const parsedBody: unknown = await req.json();
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
      const internalUser = await requireInternalUserByAuthId(userId);
      // Enforces durable DB-backed limit; throws RateLimitError (429) when exceeded.
      const rateLimitInfo = await checkPlanGenerationRateLimit(
        internalUser.id,
        db
      );
      const generationRateLimitHeaders =
        getPlanGenerationRateLimitHeaders(rateLimitInfo);

      logger.info({ authUserId: userId }, 'Running plan creation preflight');
      const preflight = await preparePlanCreationPreflight({
        body,
        authUserId: userId,
        resolvedUser: internalUser,
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
        userTier,
        startDate,
        deadlineDate,
        preparedInput: { extractedContext, topic, pdfProvenance },
      } = preflight.data;

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
          userId: internalUser.id,
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
          userId: internalUser.id,
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

        if (isAllowedModel) {
          logger.info(
            {
              authUserId: userId,
              userId: internalUser.id,
              modelOverride: suppliedModel,
            },
            'Model override provided for stream generation'
          );
          modelOverride = suppliedModel;
        } else {
          // Silent fallback: invalid model param is ignored; tier default is used.
          // Do not log raw user-supplied value (logging hygiene / injection risk).
          // API consumers can rely on tier default; consider X-Model-Used header if callers need to observe the selected model.
          logger.warn(
            {
              authUserId: userId,
              userId: internalUser.id,
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
          const { dbClient: streamDb, cleanup: cleanupStreamDb } =
            await createStreamDbClient(userId);
          let streamDbClosed = false;
          const closeStreamDb = async (): Promise<void> => {
            if (streamDbClosed) {
              return;
            }
            streamDbClosed = true;
            try {
              await cleanupStreamDb();
            } catch (error) {
              logger.error(
                { planId: plan.id, userId: internalUser.id, error },
                'Failed to close stream DB client'
              );
            }
          };

          streamContext.onCancel(() => {
            void closeStreamDb();
          });

          try {
            const planStartEvent = buildPlanStartEvent({
              planId: plan.id,
              input: normalizedInput,
            });
            emit(planStartEvent);

            await executeGenerationStream({
              reqSignal: req.signal,
              streamSignal: streamContext.signal,
              planId: plan.id,
              userId: internalUser.id,
              dbClient: streamDb,
              emit,
              runGeneration: async (signal) => {
                const result = await runGen(
                  {
                    planId: plan.id,
                    userId: internalUser.id,
                    input: generationInput,
                  },
                  { provider, signal, dbClient: streamDb }
                );
                return result;
              },
              onUnhandledError: async (error, startedAt) => {
                logger.error(
                  {
                    planId: plan.id,
                    userId: internalUser.id,
                    classification: UNSTRUCTURED_EXCEPTION_CLASSIFICATION,
                    durationMs: Math.max(0, Date.now() - startedAt),
                    error: serializeError(error),
                  },
                  'Unhandled exception during stream generation; marking plan failed'
                );

                logger.warn(
                  { planId: plan.id, userId: internalUser.id },
                  'Calling safeMarkPlanFailed after unhandled stream error'
                );
                await safeMarkPlanFailed(plan.id, internalUser.id, streamDb);
                logger.info(
                  { planId: plan.id, userId: internalUser.id },
                  'safeMarkPlanFailed completed after unhandled stream error'
                );
              },
              fallbackClassification: UNSTRUCTURED_EXCEPTION_CLASSIFICATION,
            });
            logger.info(
              { planId: plan.id, userId: internalUser.id },
              'executeGenerationStream completed'
            );
          } finally {
            await closeStreamDb();
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

async function createStreamDbClient(authUserId: string): Promise<{
  dbClient: ReturnType<typeof getDb>;
  cleanup: () => Promise<void>;
}> {
  if (appEnv.isTest) {
    // Test mode: shared getDb() + no-op cleanup for speed. Production RLS client lifecycle (createAuthenticatedRlsClient → cleanup) is not exercised here.
    return {
      dbClient: getDb(),
      cleanup: async () => {},
    };
  }

  const { createAuthenticatedRlsClient } = await import('@/lib/db/rls');
  const { db, cleanup } = await createAuthenticatedRlsClient(authUserId);
  return {
    dbClient: db,
    cleanup,
  };
}

function toPayloadLog(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') {
    return { payloadType: typeof payload };
  }

  const rec = payload as Record<string, unknown>;
  return {
    topic: typeof rec.topic === 'string' ? rec.topic : null,
    skillLevel: typeof rec.skillLevel === 'string' ? rec.skillLevel : null,
    weeklyHours: typeof rec.weeklyHours === 'number' ? rec.weeklyHours : null,
    learningStyle:
      typeof rec.learningStyle === 'string' ? rec.learningStyle : null,
    visibility: typeof rec.visibility === 'string' ? rec.visibility : null,
    origin: typeof rec.origin === 'string' ? rec.origin : null,
    hasNotes: typeof rec.notes === 'string' && rec.notes.length > 0,
    hasExtractedContent:
      typeof rec.extractedContent === 'object' && rec.extractedContent !== null,
  };
}
