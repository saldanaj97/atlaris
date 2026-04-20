import {
  createEventStream,
  streamHeaders,
} from '@/features/ai/streaming/events';
import { resolveUserTier } from '@/features/billing/tier';
import type { PlansDbClient } from '@/features/plans/api/route-context';
import {
  type CreatePlanResult,
  createPlanLifecycleService,
  type GenerationAttemptResult,
  type JobQueuePort,
  type PermanentFailure,
  type PlanLifecycleService,
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
 * Minimal plan snapshot needed to retry generation without route-owned session wiring.
 *
 * Routes hydrate this from the persisted plan row before delegating to
 * {@link PlanGenerationSessionBoundary.respondRetryStream}.
 */
export interface RetryPlanGenerationPlanSnapshot {
  topic: string;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  weeklyHours: number;
  learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
  startDate: string | null;
  deadlineDate: string | null;
  origin: 'ai' | 'manual' | 'template' | null;
}

/** Args for boundary `respondCreateStream` — supplied after HTTP preflight. */
export interface RespondCreateStreamArgs {
  req: Request;
  authUserId: string;
  internalUserId: string;
  body: CreateLearningPlanInput;
  savedPreferredAiModel: string | null;
  responseHeaders?: HeadersInit;
}

/** Args for boundary `respondRetryStream` — supplied after HTTP preflight. */
export interface RespondRetryStreamArgs {
  req: Request;
  authUserId: string;
  internalUserId: string;
  planId: string;
  attemptNumber: number;
  plan: RetryPlanGenerationPlanSnapshot;
  tierDb: PlansDbClient;
  responseHeaders?: HeadersInit;
}

/**
 * Public boundary that turns a validated create or retry intent into a
 * streaming plan-generation `Response`.
 *
 * Implementations hide:
 * - stream-scoped DB lease creation and idempotent cleanup
 * - lifecycle service construction on that lease
 * - create vs retry orchestration branching
 * - model resolution and logging
 * - `plan_start` emission and SSE event sequencing
 * - disconnect suppression and fallback failure emission
 * - `safeMarkPlanFailed` / unhandled-exception cleanup behavior
 */
export interface PlanGenerationSessionBoundary {
  respondCreateStream(args: RespondCreateStreamArgs): Promise<Response>;
  respondRetryStream(args: RespondRetryStreamArgs): Promise<Response>;
}

/** Lifecycle factory injected at the boundary; defaults to the production wiring. */
type CreateLifecycleService = (
  dbClient: AttemptsDbClient
) => PlanLifecycleService;

/** Optional dependency overrides for {@link createPlanGenerationSessionBoundary}. */
interface CreateSessionBoundaryDeps {
  createLifecycleService?: CreateLifecycleService;
}

/**
 * Build a {@link PlanGenerationSessionBoundary}.
 *
 * Tests inject a fake `createLifecycleService` to swap the lifecycle service
 * under the boundary; production code calls this with no deps to get the
 * default `createPlanLifecycleService` wiring with a noop job queue.
 */
export function createPlanGenerationSessionBoundary(
  deps: CreateSessionBoundaryDeps = {}
): PlanGenerationSessionBoundary {
  const buildLifecycle: CreateLifecycleService =
    deps.createLifecycleService ??
    ((dbClient) =>
      createPlanLifecycleService({ dbClient, jobQueue: noopJobQueue }));

  return {
    respondCreateStream: (args) =>
      run({ kind: 'create', ...args }, buildLifecycle),
    respondRetryStream: (args) =>
      run({ kind: 'retry', ...args }, buildLifecycle),
  };
}

// ─── Internal: shared run path ─────────────────────────────────────────────

type SessionCommand =
  | ({ kind: 'create' } & RespondCreateStreamArgs)
  | ({ kind: 'retry' } & RespondRetryStreamArgs);

interface PreparedSessionPlan {
  planId: string;
  attemptNumber: number;
  planStartInput: CreateLearningPlanInput;
  generationInput: ProcessGenerationInput;
  fallbackClassification: FailureClassification | 'unknown';
  onUnhandledError: (
    error: unknown,
    startedAt: number,
    dbClient: AttemptsDbClient
  ) => Promise<void>;
}

async function run(
  command: SessionCommand,
  buildLifecycle: CreateLifecycleService
): Promise<Response> {
  const { dbClient, closeStreamDb } = await openStreamSession(
    command.authUserId
  );

  try {
    const lifecycleService = buildLifecycle(dbClient);

    const prepared =
      command.kind === 'create'
        ? await prepareCreate(command, lifecycleService)
        : await prepareRetry(command, lifecycleService);

    return await createPlanGenerationSessionResponse({
      req: command.req,
      authUserId: command.authUserId,
      dbClient,
      cleanup: closeStreamDb,
      planId: prepared.planId,
      attemptNumber: prepared.attemptNumber,
      planStartInput: prepared.planStartInput,
      generationInput: prepared.generationInput,
      processGeneration:
        lifecycleService.processGenerationAttempt.bind(lifecycleService),
      onUnhandledError: prepared.onUnhandledError,
      fallbackClassification: prepared.fallbackClassification,
      responseHeaders: command.responseHeaders,
    });
  } catch (error) {
    await closeStreamDb();
    throw error;
  }
}

async function prepareCreate(
  command: Extract<SessionCommand, { kind: 'create' }>,
  lifecycleService: PlanLifecycleService
): Promise<PreparedSessionPlan> {
  const { req, authUserId, internalUserId, body, savedPreferredAiModel } =
    command;

  const createResult = await lifecycleService.createPlan({
    userId: internalUserId,
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

  const ignoredSuppliedModel =
    suppliedModel !== undefined && resolutionSource !== 'query_override';

  const resolutionMessage =
    resolutionSource === 'query_override'
      ? 'Model override from query for stream generation'
      : resolutionSource === 'saved_preference'
        ? 'Using saved preferred AI model for stream generation'
        : 'No query override or saved preference; tier default applies';

  const resolutionMeta = {
    authUserId,
    userId: internalUserId,
    planId: createResult.planId,
    tier: createResult.tier,
    modelResolutionSource: resolutionSource,
    suppliedModel,
    ...(modelOverride !== undefined ? { modelOverride } : {}),
    ...(ignoredSuppliedModel ? { ignoredSuppliedModel: true } : {}),
  };

  // Use `warn` when an explicit query override was rejected so callers can
  // diagnose tier/validation issues; otherwise `info` for the resolved source.
  if (ignoredSuppliedModel) {
    logger.warn(resolutionMeta, resolutionMessage);
  } else {
    logger.info(resolutionMeta, resolutionMessage);
  }

  const generationInput = buildCreateGenerationInput({
    body,
    createResult,
    userId: internalUserId,
    modelOverride,
  });

  return {
    planId: createResult.planId,
    attemptNumber: 1,
    planStartInput: {
      ...body,
      topic: createResult.normalizedInput.topic,
      startDate: createResult.normalizedInput.startDate ?? undefined,
      deadlineDate: createResult.normalizedInput.deadlineDate ?? undefined,
    },
    generationInput,
    fallbackClassification: UNSTRUCTURED_EXCEPTION_CLASSIFICATION,
    onUnhandledError: async (error, startedAt, sessionDbClient) => {
      logger.error(
        {
          planId: createResult.planId,
          userId: internalUserId,
          classification: UNSTRUCTURED_EXCEPTION_CLASSIFICATION,
          durationMs: Math.max(0, Date.now() - startedAt),
          error: serializeError(error),
        },
        'Unhandled exception during stream generation; marking plan failed'
      );

      await safeMarkPlanFailed(
        createResult.planId,
        internalUserId,
        sessionDbClient
      );
    },
  };
}

async function prepareRetry(
  command: Extract<SessionCommand, { kind: 'retry' }>,
  _lifecycleService: PlanLifecycleService
): Promise<PreparedSessionPlan> {
  const { internalUserId, planId, attemptNumber, plan, tierDb } = command;

  const tier = await resolveUserTier(internalUserId, tierDb);

  return {
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
      userId: internalUserId,
      tier,
      input: {
        topic: plan.topic,
        skillLevel: plan.skillLevel,
        weeklyHours: plan.weeklyHours,
        learningStyle: plan.learningStyle,
        startDate: toIsoDateString(plan.startDate, 'startDate'),
        deadlineDate: toIsoDateString(plan.deadlineDate, 'deadlineDate'),
      },
    },
    fallbackClassification: 'provider_error',
    onUnhandledError: async (error, startedAt, sessionDbClient) => {
      const classification = classifyError(error);
      logger.error(
        {
          planId,
          userId: internalUserId,
          classification,
          durationMs: Math.max(0, Date.now() - startedAt),
          error: serializeError(error),
        },
        'Unhandled exception during retry generation; marking plan failed'
      );

      await safeMarkPlanFailed(planId, internalUserId, sessionDbClient);
    },
  };
}

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
  responseHeaders?: HeadersInit;
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
  responseHeaders,
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
        ...responseHeaders,
      },
    });
  } catch (error) {
    await cleanup();
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
