import { ZodError } from 'zod';
import {
  buildPlanStartEvent,
  executeLifecycleGenerationStream,
  safeMarkPlanFailed,
} from '@/app/api/v1/plans/stream/helpers';
import { AVAILABLE_MODELS } from '@/features/ai/ai-models';
import {
  createEventStream,
  streamHeaders,
} from '@/features/ai/streaming/events';
import type { JobQueuePort } from '@/features/plans/lifecycle';
import {
  createPlanLifecycleService,
  type GenerationAttemptResult,
  type ProcessGenerationInput,
} from '@/features/plans/lifecycle';
import { createLearningPlanSchema } from '@/features/plans/validation/learningPlans';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import type { PlainHandler } from '@/lib/api/auth';
import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import {
  AppError,
  AttemptCapExceededError,
  ValidationError,
} from '@/lib/api/errors';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { appEnv } from '@/lib/config/env';
import { getDb } from '@/lib/db/runtime';
import { logger } from '@/lib/logging/logger';

/** Classification used when an unstructured exception occurs in the generation catch block. */
export const UNSTRUCTURED_EXCEPTION_CLASSIFICATION = 'provider_error' as const;

/**
 * Dependency injection interface for tests.
 * Tests can override `processGenerationAttempt` to inject mocked generation behavior.
 */
export interface StreamDependencyOverrides {
  processGenerationAttempt?: (
    input: ProcessGenerationInput
  ) => Promise<GenerationAttemptResult>;
}

const ALLOWED_MODELS = new Set(AVAILABLE_MODELS.map((model) => model.id));

/** Stub JobQueuePort — stream route does not enqueue jobs. */
const noopJobQueue: JobQueuePort = {
  async enqueueJob() {
    return '';
  },
  async completeJob() {},
  async failJob() {},
};

/**
 * Creates the stream POST handler with optional dependency overrides.
 * Used by integration tests to supply mocks; production uses the default lifecycle service.
 */
export function createStreamHandler(deps?: {
  overrides?: StreamDependencyOverrides;
}): PlainHandler {
  return withErrorBoundary(
    withAuthAndRateLimit(
      'aiGeneration',
      async ({ req, userId, user: currentUser }) => {
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
            throw new ValidationError(
              'Invalid request body.',
              error.flatten(),
              { authUserId: userId, validation: error.flatten() }
            );
          }
          throw new ValidationError(
            'Invalid request body.',
            { reason: 'Malformed or invalid JSON payload.' },
            { authUserId: userId, error: serializeError(error) }
          );
        }

        const db = getDb();
        const internalUserId = currentUser.id;

        // ─── Rate limiting (generation-specific, checked BEFORE plan creation) ──
        const rateLimit = await checkPlanGenerationRateLimit(
          internalUserId,
          db
        );
        const generationRateLimitHeaders =
          getPlanGenerationRateLimitHeaders(rateLimit);

        // ─── Stream-scoped DB connection for ALL lifecycle operations ─────
        // Connection 1 (db from getDb/withAuth) is only for rate limiting above.
        // All plan creation, generation, usage recording, and success/failure marking
        // use this stream-scoped connection that survives the entire SSE stream.
        logger.info(
          { authUserId: userId },
          'Creating plan via lifecycle service'
        );

        const { dbClient: streamDb, cleanup: cleanupStreamDb } =
          await createStreamDbClient(userId);
        let streamDbClosed = false;
        const closeStreamDb = async (): Promise<void> => {
          if (streamDbClosed) return;
          streamDbClosed = true;
          try {
            await cleanupStreamDb();
          } catch (error) {
            logger.error(
              { userId: internalUserId, error: serializeError(error) },
              'Failed to close stream DB client'
            );
          }
        };

        const lifecycleService = createPlanLifecycleService({
          dbClient: streamDb,
          jobQueue: noopJobQueue,
        });

        const isPdfOrigin = body.origin === 'pdf';
        const createResult = isPdfOrigin
          ? await lifecycleService.createPdfPlan({
              userId: internalUserId,
              authUserId: userId,
              body: body as unknown as Record<string, unknown>,
              topic: body.topic,
              skillLevel: body.skillLevel,
              weeklyHours: body.weeklyHours,
              learningStyle: body.learningStyle,
              startDate: body.startDate,
              deadlineDate: body.deadlineDate,
              extractedContent: (body as Record<string, unknown>)
                .extractedContent,
              pdfProofToken: (body as Record<string, unknown>)
                .pdfProofToken as string,
              pdfExtractionHash: (body as Record<string, unknown>)
                .pdfExtractionHash as string,
            })
          : await lifecycleService.createPlan({
              userId: internalUserId,
              topic: body.topic,
              skillLevel: body.skillLevel,
              weeklyHours: body.weeklyHours,
              learningStyle: body.learningStyle,
              startDate: body.startDate,
              deadlineDate: body.deadlineDate,
            });

        if (createResult.status !== 'success') {
          await closeStreamDb();
          if (createResult.status === 'duplicate_detected') {
            throw new AppError(
              'A plan with this topic is already being generated. Please wait for it to complete.',
              {
                status: 409,
                code: 'DUPLICATE_PLAN',
                details: { existingPlanId: createResult.existingPlanId },
              }
            );
          }
          if (createResult.status === 'quota_rejected') {
            throw new AppError(createResult.reason, {
              status: 403,
              code: 'QUOTA_EXCEEDED',
              details: { upgradeUrl: createResult.upgradeUrl },
            });
          }
          if (createResult.status === 'attempt_cap_exceeded') {
            throw new AttemptCapExceededError(createResult.reason, {
              planId: createResult.cappedPlanId,
            });
          }
          // permanent_failure or retryable_failure from plan creation
          const err =
            'error' in createResult
              ? createResult.error
              : new Error('Plan creation failed');
          const isRetryable = createResult.status === 'retryable_failure';
          throw new AppError(err.message, {
            status: isRetryable ? 503 : 400,
            code: isRetryable
              ? 'PLAN_CREATION_TEMPORARY_FAILURE'
              : 'PLAN_CREATION_FAILED',
          });
        }

        const planId = createResult.planId;
        const tier = createResult.tier;
        const { normalizedInput: ni } = createResult;

        logger.info(
          { planId, userId: internalUserId, authUserId: userId },
          'Plan created via lifecycle service'
        );

        // ─── Model override from URL params ──────────────────────
        const url = new URL(req.url);
        let modelOverride: string | undefined;
        if (url.searchParams.has('model')) {
          const suppliedModel = url.searchParams.get('model') ?? '';
          const isAllowedModel = ALLOWED_MODELS.has(suppliedModel);

          if (isAllowedModel) {
            logger.info(
              {
                authUserId: userId,
                userId: internalUserId,
                modelOverride: suppliedModel,
              },
              'Model override provided for stream generation'
            );
            modelOverride = suppliedModel;
          } else {
            logger.warn(
              { authUserId: userId, userId: internalUserId },
              'Ignoring invalid model override for stream generation'
            );
            modelOverride = undefined;
          }
        }

        // ─── Build generation input ──────────────────────────────
        const generationInput: ProcessGenerationInput = {
          planId,
          userId: internalUserId,
          tier,
          input: {
            topic: ni.topic,
            notes: body.notes ?? undefined,
            skillLevel: body.skillLevel,
            weeklyHours: body.weeklyHours,
            learningStyle: body.learningStyle,
            startDate: ni.startDate,
            deadlineDate: ni.deadlineDate,
            pdfContext: ni.pdfContext,
            pdfExtractionHash: ni.pdfExtractionHash,
            pdfProofVersion: ni.pdfProofVersion,
          },
          modelOverride,
        };

        const normalizedInputForEvent: CreateLearningPlanInput = {
          ...body,
          topic: ni.topic,
          startDate: ni.startDate ?? undefined,
          deadlineDate: ni.deadlineDate ?? undefined,
        };

        // Resolve the processGeneration function (allow test override)
        const processGeneration =
          deps?.overrides?.processGenerationAttempt ??
          lifecycleService.processGenerationAttempt.bind(lifecycleService);

        // ─── SSE stream ──────────────────────────────────────────
        const stream = createEventStream(
          async (emit, _controller, streamContext) => {
            try {
              const planStartEvent = buildPlanStartEvent({
                planId,
                input: normalizedInputForEvent,
              });
              emit(planStartEvent);

              await executeLifecycleGenerationStream({
                reqSignal: req.signal,
                streamSignal: streamContext.signal,
                planId,
                userId: internalUserId,
                emit,
                processGeneration: () => processGeneration(generationInput),
                onUnhandledError: async (error, startedAt) => {
                  logger.error(
                    {
                      planId,
                      userId: internalUserId,
                      classification: UNSTRUCTURED_EXCEPTION_CLASSIFICATION,
                      durationMs: Math.max(0, Date.now() - startedAt),
                      error: serializeError(error),
                    },
                    'Unhandled exception during stream generation; marking plan failed'
                  );

                  await safeMarkPlanFailed(planId, internalUserId, streamDb);
                },
                fallbackClassification: UNSTRUCTURED_EXCEPTION_CLASSIFICATION,
              });
              logger.info(
                { planId, userId: internalUserId },
                'executeLifecycleGenerationStream completed'
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
      }
    )
  );
}

export const POST = createStreamHandler();

async function createStreamDbClient(authUserId: string): Promise<{
  dbClient: ReturnType<typeof getDb>;
  cleanup: () => Promise<void>;
}> {
  if (appEnv.isTest) {
    return {
      dbClient: getDb(),
      cleanup: async () => {},
    };
  }

  const { createAuthenticatedRlsClient } = await import('@/lib/db/rls');
  const { db, cleanup } = await createAuthenticatedRlsClient(authUserId, {
    idleTimeout: 180,
  });
  return {
    dbClient: db,
    cleanup,
  };
}

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
