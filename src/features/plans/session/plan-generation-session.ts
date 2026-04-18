import {
  createEventStream,
  streamHeaders,
} from '@/features/ai/streaming/events';
import { resolveUserTier } from '@/features/billing/tier';
import type { PdfContext } from '@/features/pdf/context.types';
import type { PlansDbClient } from '@/features/plans/api/route-context';
import {
  type CreatePdfPlanInput,
  type CreatePlanResult,
  createPlanLifecycleService,
  type GenerationAttemptResult,
  type JobQueuePort,
  type PermanentFailure,
  type ProcessGenerationInput,
  type RetryableFailure,
} from '@/features/plans/lifecycle';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import { AppError, AttemptCapExceededError } from '@/lib/api/errors';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import { logger } from '@/lib/logging/logger';
import type { FailureClassification } from '@/shared/types/client.types';
import { resolveStreamModelResolution } from './model-resolution';
import { safeMarkPlanFailed } from './stream-cleanup';
import { createStreamDbClient } from './stream-db';
import {
  buildPlanStartEvent,
  executeLifecycleGenerationStream,
} from './stream-emitters';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UNSTRUCTURED_EXCEPTION_CLASSIFICATION = 'provider_error' as const;
const PLAN_CREATION_FAILURE_MAP: Record<
  FailureClassification | 'unknown',
  { status: number; code: string }
> = {
  validation: { status: 400, code: 'PLAN_CREATION_VALIDATION_FAILED' },
  capped: { status: 403, code: 'PLAN_CREATION_CAPPED' },
  conflict: { status: 409, code: 'PLAN_CREATION_CONFLICT' },
  rate_limit: { status: 429, code: 'PLAN_CREATION_RATE_LIMITED' },
  timeout: { status: 504, code: 'PLAN_CREATION_TIMEOUT' },
  provider_error: { status: 503, code: 'PLAN_CREATION_PROVIDER_ERROR' },
  unknown: { status: 500, code: 'PLAN_CREATION_FAILED' },
};

const noopJobQueue: JobQueuePort = {
  async enqueueJob() {
    return '';
  },
  async completeJob() {},
  async failJob() {},
};

/**
 * Parameters for the shared SSE response constructor used by both create and retry flows.
 */
interface CreatePlanGenerationSessionResponseParams {
  req: Request;
  authUserId: string;
  dbClient: AttemptsDbClient;
  cleanup: () => Promise<void>;
  planId: string;
  attemptNumber?: number;
  planStartInput: CreateLearningPlanInput;
  generationInput: ProcessGenerationInput;
  processGeneration: (
    input: ProcessGenerationInput
  ) => Promise<GenerationAttemptResult>;
  onUnhandledError: (
    error: unknown,
    startedAt: number,
    dbClient: AttemptsDbClient
  ) => Promise<void>;
  fallbackClassification?: FailureClassification | 'unknown';
  headers?: HeadersInit;
}

/**
 * Parameters for create-and-stream generation, after HTTP validation is complete.
 */
interface CreateAndStreamPlanGenerationSessionParams {
  req: Request;
  authUserId: string;
  userId: string;
  body: CreateLearningPlanInput;
  savedPreferredAiModel: string | null;
  headers?: HeadersInit;
  processGenerationAttempt?: (
    input: ProcessGenerationInput
  ) => Promise<GenerationAttemptResult>;
}

/**
 * Minimal plan snapshot needed to retry generation without route-owned session wiring.
 */
interface RetryPlanGenerationPlanSnapshot {
  topic: string;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  weeklyHours: number;
  learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
  startDate: string | null;
  deadlineDate: string | null;
  origin: 'ai' | 'manual' | 'pdf' | 'template' | null;
  pdfContext: PdfContext | null;
}

/**
 * Parameters for retry-and-stream generation, after ownership/status preflight is complete.
 */
interface RetryAndStreamPlanGenerationSessionParams {
  req: Request;
  authUserId: string;
  userId: string;
  planId: string;
  attemptNumber: number;
  requestDb: PlansDbClient;
  plan: RetryPlanGenerationPlanSnapshot;
  headers?: HeadersInit;
  processGenerationAttempt?: (
    input: ProcessGenerationInput
  ) => Promise<GenerationAttemptResult>;
}

async function createPlanGenerationSessionResponse({
  req,
  authUserId,
  dbClient,
  cleanup,
  planId,
  attemptNumber = 1,
  planStartInput,
  generationInput,
  processGeneration,
  onUnhandledError,
  fallbackClassification = 'provider_error',
  headers,
}: CreatePlanGenerationSessionResponseParams): Promise<Response> {
  try {
    const stream = createEventStream(
      async (emit, _controller, streamContext) => {
        try {
          emit(
            buildPlanStartEvent({
              planId,
              attemptNumber,
              input: planStartInput,
            })
          );

          await executeLifecycleGenerationStream({
            reqSignal: req.signal,
            streamSignal: streamContext.signal,
            planId,
            userId: authUserId,
            emit,
            processGeneration: () => processGeneration(generationInput),
            onUnhandledError: async (error, startedAt) => {
              await onUnhandledError(error, startedAt, dbClient);
            },
            fallbackClassification,
          });
        } finally {
          await cleanup();
        }
      }
    );

    return new Response(stream, {
      status: 200,
      headers: {
        ...streamHeaders,
        ...headers,
      },
    });
  } catch (error) {
    await cleanup();
    throw error;
  }
}

export async function createAndStreamPlanGenerationSession({
  req,
  authUserId,
  userId,
  body,
  savedPreferredAiModel,
  headers,
  processGenerationAttempt,
}: CreateAndStreamPlanGenerationSessionParams): Promise<Response> {
  const { dbClient, closeStreamDb } = await openStreamSession(authUserId);

  try {
    const lifecycleService = createPlanLifecycleService({
      dbClient,
      jobQueue: noopJobQueue,
    });

    const createResult =
      body.origin === 'pdf'
        ? await lifecycleService.createPdfPlan(
            buildCreatePdfPlanInput({
              body: requirePdfCreateBody(body),
              userId,
              authUserId,
            })
          )
        : await lifecycleService.createPlan({
            userId,
            topic: body.topic,
            skillLevel: body.skillLevel,
            weeklyHours: body.weeklyHours,
            learningStyle: body.learningStyle,
            startDate: body.startDate,
            deadlineDate: body.deadlineDate,
          });

    if (createResult.status !== 'success') {
      throwCreatePlanResultError(createResult);
    }

    const { modelOverride, resolutionSource, suppliedModel } =
      resolveStreamModelResolution({
        searchParams: new URL(req.url).searchParams,
        tier: createResult.tier,
        savedPreferredAiModel,
      });

    if (suppliedModel !== undefined && resolutionSource !== 'query_override') {
      logger.warn(
        {
          authUserId,
          userId,
          planId: createResult.planId,
          tier: createResult.tier,
          suppliedModel,
          modelResolutionSource: resolutionSource,
        },
        'Ignoring invalid or tier-denied model override for stream generation'
      );
    }

    if (resolutionSource === 'query_override') {
      logger.info(
        {
          authUserId,
          userId,
          planId: createResult.planId,
          modelResolutionSource: resolutionSource,
          modelOverride,
          suppliedModel,
        },
        'Model override from query for stream generation'
      );
    } else if (resolutionSource === 'saved_preference') {
      logger.info(
        {
          authUserId,
          userId,
          planId: createResult.planId,
          modelResolutionSource: resolutionSource,
          modelOverride,
          suppliedModel,
        },
        'Using saved preferred AI model for stream generation'
      );
    } else {
      logger.info(
        {
          authUserId,
          userId,
          planId: createResult.planId,
          modelResolutionSource: resolutionSource,
          suppliedModel,
        },
        'No query override or saved preference; tier default applies'
      );
    }

    const generationInput = buildCreateGenerationInput({
      body,
      createResult,
      userId,
      modelOverride,
    });

    const processGeneration =
      processGenerationAttempt ??
      lifecycleService.processGenerationAttempt.bind(lifecycleService);

    return await createPlanGenerationSessionResponse({
      req,
      authUserId,
      dbClient,
      cleanup: closeStreamDb,
      planId: createResult.planId,
      attemptNumber: 1,
      planStartInput: {
        ...body,
        topic: createResult.normalizedInput.topic,
        startDate: createResult.normalizedInput.startDate ?? undefined,
        deadlineDate: createResult.normalizedInput.deadlineDate ?? undefined,
      },
      generationInput,
      processGeneration,
      onUnhandledError: async (error, startedAt, sessionDbClient) => {
        logger.error(
          {
            planId: createResult.planId,
            userId,
            classification: UNSTRUCTURED_EXCEPTION_CLASSIFICATION,
            durationMs: Math.max(0, Date.now() - startedAt),
            error: serializeError(error),
          },
          'Unhandled exception during stream generation; marking plan failed'
        );

        await safeMarkPlanFailed(createResult.planId, userId, sessionDbClient);
      },
      fallbackClassification: UNSTRUCTURED_EXCEPTION_CLASSIFICATION,
      headers,
    });
  } catch (error) {
    await closeStreamDb();
    throw error;
  }
}

export async function retryAndStreamPlanGenerationSession({
  req,
  authUserId,
  userId,
  planId,
  attemptNumber,
  requestDb,
  plan,
  headers,
  processGenerationAttempt,
}: RetryAndStreamPlanGenerationSessionParams): Promise<Response> {
  const { dbClient, closeStreamDb } = await openStreamSession(authUserId);

  try {
    const lifecycleService = createPlanLifecycleService({
      dbClient,
      jobQueue: noopJobQueue,
    });
    const tier = await resolveUserTier(userId, requestDb);
    const processGeneration =
      processGenerationAttempt ??
      lifecycleService.processGenerationAttempt.bind(lifecycleService);

    return await createPlanGenerationSessionResponse({
      req,
      authUserId,
      dbClient,
      cleanup: closeStreamDb,
      planId,
      attemptNumber,
      planStartInput: {
        topic: plan.topic,
        skillLevel: plan.skillLevel,
        weeklyHours: plan.weeklyHours,
        learningStyle: plan.learningStyle,
        notes: undefined,
        startDate: toIsoDateString(plan.startDate, 'startDate'),
        deadlineDate: toIsoDateString(plan.deadlineDate, 'deadlineDate'),
        visibility: 'private',
        origin: plan.origin ?? 'ai',
      },
      generationInput: {
        planId,
        userId,
        tier,
        input: {
          topic: plan.topic,
          pdfContext: plan.origin === 'pdf' ? plan.pdfContext : null,
          skillLevel: plan.skillLevel,
          weeklyHours: plan.weeklyHours,
          learningStyle: plan.learningStyle,
          startDate: toIsoDateString(plan.startDate, 'startDate'),
          deadlineDate: toIsoDateString(plan.deadlineDate, 'deadlineDate'),
        },
      },
      processGeneration,
      onUnhandledError: async (error, startedAt, sessionDbClient) => {
        const classification = classifyError(error);
        logger.error(
          {
            planId,
            userId,
            classification,
            durationMs: Math.max(0, Date.now() - startedAt),
            error: serializeError(error),
          },
          'Unhandled exception during retry generation; marking plan failed'
        );

        await safeMarkPlanFailed(planId, userId, sessionDbClient);
      },
      fallbackClassification: 'provider_error',
      headers,
    });
  } catch (error) {
    await closeStreamDb();
    throw error;
  }
}

async function openStreamSession(authUserId: string): Promise<{
  dbClient: AttemptsDbClient;
  closeStreamDb: () => Promise<void>;
}> {
  const { dbClient, cleanup } = await createStreamDbClient(authUserId);

  return {
    dbClient,
    closeStreamDb: createSafeStreamCleanup(authUserId, cleanup),
  };
}

type PdfCreateLearningPlanInput = CreateLearningPlanInput & {
  origin: 'pdf';
  extractedContent: NonNullable<CreateLearningPlanInput['extractedContent']>;
  pdfProofToken: NonNullable<CreateLearningPlanInput['pdfProofToken']>;
  pdfExtractionHash: NonNullable<CreateLearningPlanInput['pdfExtractionHash']>;
  pdfProofVersion: NonNullable<CreateLearningPlanInput['pdfProofVersion']>;
};

function requirePdfCreateBody(
  body: CreateLearningPlanInput
): PdfCreateLearningPlanInput {
  if (
    body.origin !== 'pdf' ||
    !body.extractedContent ||
    !body.pdfProofToken ||
    !body.pdfExtractionHash ||
    body.pdfProofVersion !== 1
  ) {
    throw new AppError('Invalid PDF-origin plan payload.', {
      status: 400,
      code: 'VALIDATION_ERROR',
      classification: 'validation',
    });
  }

  return {
    ...body,
    origin: 'pdf',
    extractedContent: body.extractedContent,
    pdfProofToken: body.pdfProofToken,
    pdfExtractionHash: body.pdfExtractionHash,
    pdfProofVersion: body.pdfProofVersion,
  };
}

function buildCreatePdfPlanInput({
  body,
  userId,
  authUserId,
}: {
  body: PdfCreateLearningPlanInput;
  userId: string;
  authUserId: string;
}): CreatePdfPlanInput {
  return {
    userId,
    authUserId,
    body,
    topic: body.topic,
    skillLevel: body.skillLevel,
    weeklyHours: body.weeklyHours,
    learningStyle: body.learningStyle,
    startDate: body.startDate,
    deadlineDate: body.deadlineDate,
    extractedContent: body.extractedContent,
    pdfProofToken: body.pdfProofToken,
    pdfExtractionHash: body.pdfExtractionHash,
    pdfProofVersion: body.pdfProofVersion,
  };
}

function createSafeStreamCleanup(
  authUserId: string,
  cleanup: () => Promise<void>
): () => Promise<void> {
  let closed = false;

  return async () => {
    if (closed) {
      return;
    }
    closed = true;

    try {
      await cleanup();
    } catch (error) {
      logger.error({ authUserId, error }, 'Failed to close stream DB client');
    }
  };
}

function buildCreateGenerationInput({
  body,
  createResult,
  userId,
  modelOverride,
}: {
  body: CreateLearningPlanInput;
  createResult: Extract<CreatePlanResult, { status: 'success' }>;
  userId: string;
  modelOverride?: string | null;
}): ProcessGenerationInput {
  const { normalizedInput: ni, planId, tier } = createResult;

  return {
    planId,
    userId,
    tier,
    input: {
      topic: ni.topic,
      notes: body.notes,
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
}

function throwCreatePlanResultError(
  createResult: Exclude<CreatePlanResult, { status: 'success' }>
): never {
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

  throwPlanCreationFailure(createResult);
}

function throwPlanCreationFailure(
  createResult: PermanentFailure | RetryableFailure
): never {
  const error = createResult.error;
  const { status, code } =
    PLAN_CREATION_FAILURE_MAP[createResult.classification] ??
    PLAN_CREATION_FAILURE_MAP.unknown;

  logger.warn(
    {
      status: createResult.status,
      classification: createResult.classification,
      error: error.message,
    },
    'Plan creation failure'
  );

  throw new AppError(error.message, {
    status,
    code,
    classification:
      createResult.classification === 'unknown'
        ? undefined
        : createResult.classification,
    cause: error,
  });
}

function toIsoDateString(
  value: string | null,
  field: 'startDate' | 'deadlineDate'
): string | undefined {
  if (!value) {
    return undefined;
  }

  if (ISO_DATE_PATTERN.test(value)) {
    return value;
  }

  logger.warn(
    { field, value },
    'Ignoring persisted plan session date with invalid ISO calendar format'
  );
  return undefined;
}

function classifyError(error: unknown): FailureClassification | 'unknown' {
  if (error instanceof AppError) {
    return error.classification() ?? 'provider_error';
  }

  if (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  ) {
    return 'timeout';
  }

  return 'provider_error';
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
