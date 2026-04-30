import {
  createEventStream,
  streamHeaders,
} from '@/features/ai/streaming/events';
import { resolveUserTier } from '@/features/billing/tier';
import { PlanPersistenceAdapter } from '@/features/plans/lifecycle/adapters/plan-persistence-adapter';
import { createPlanLifecycleService } from '@/features/plans/lifecycle/factory';
import { PLAN_CREATION_FAILURE_HTTP_MAP } from '@/features/plans/plan-creation-failure-http';
import { AppError, AttemptCapExceededError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';
import { resolveStreamModelResolution } from './model-resolution';
import { safeMarkPlanFailed } from './stream-cleanup';
import { createStreamDbClient } from './stream-db';
import {
  buildPlanStartEvent,
  executeLifecycleGenerationStream,
} from './stream-emitters';

import type { PlansDbClient } from '@/features/plans/api/route-context';
import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type {
  CreatePlanResult,
  GenerationAttemptResult,
  PermanentFailure,
  ProcessGenerationInput,
  RetryableFailure,
} from '@/features/plans/lifecycle/types';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import type {
  AttemptReservation,
  AttemptsDbClient,
} from '@/lib/db/queries/types/attempts.types';
import type { PlanGenerationCoreFieldsNormalized } from '@/shared/types/ai-provider.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_PROVIDER_FAILURE_CLASSIFICATION = 'provider_error' as const;

/** Statuses allowed when reserving a slot for POST /plans/:id/retry (transactional re-check). */
export const PLAN_RETRY_RESERVATION_ALLOWED_STATUSES = [
  'failed',
  'pending_retry',
] as const;

/**
 * Minimal plan snapshot needed to retry generation without route-owned session wiring.
 *
 * Routes hydrate this from the persisted plan row before delegating to
 * {@link PlanGenerationSessionBoundary.respondRetryStream}.
 */
export interface RetryPlanGenerationPlanSnapshot extends PlanGenerationCoreFieldsNormalized {
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
  plan: RetryPlanGenerationPlanSnapshot;
  tierDb: PlansDbClient;
  responseHeaders?: HeadersInit;
}

/**
 * Public boundary that turns a validated create or retry intent into a
 * streaming plan-generation `Response`.
 *
 * Implementations hide:
 * - stream-scoped DB lease lifecycle
 * - create vs retry preparation
 * - `plan_start` emission and SSE sequencing
 * - unhandled-exception cleanup
 */
export interface PlanGenerationSessionBoundary {
  respondCreateStream(args: RespondCreateStreamArgs): Promise<Response>;
  respondRetryStream(args: RespondRetryStreamArgs): Promise<Response>;
}

/** Lifecycle factory injected at the boundary; defaults to the production wiring. */
type CreateLifecycleService = (
  dbClient: AttemptsDbClient,
) => PlanLifecycleService;

/** Optional dependency overrides for {@link createPlanGenerationSessionBoundary}. */
interface CreateSessionBoundaryDeps {
  createLifecycleService?: CreateLifecycleService;
}

interface CreatePlanGenerationSessionResponseParams {
  req: Request;
  authUserId: string;
  dbClient: AttemptsDbClient;
  cleanup: () => Promise<void>;
  planId: string;
  planStartInput: CreateLearningPlanInput;
  generationInput: ProcessGenerationInput;
  processGeneration: (
    input: ProcessGenerationInput,
  ) => Promise<GenerationAttemptResult>;
  onUnhandledError: UnhandledGenerationErrorHandler;
  fallbackClassification?: FailureClassification | 'unknown';
  responseHeaders?: HeadersInit;
}

type SessionCommand =
  | ({ kind: 'create' } & RespondCreateStreamArgs)
  | ({ kind: 'retry' } & RespondRetryStreamArgs);
type CreateSessionCommand = Extract<SessionCommand, { kind: 'create' }>;
type RetrySessionCommand = Extract<SessionCommand, { kind: 'retry' }>;
type SuccessfulCreatePlanResult = Extract<
  CreatePlanResult,
  { status: 'success' }
>;
type RetryGenerationInput = Pick<
  CreateLearningPlanInput,
  | 'topic'
  | 'skillLevel'
  | 'weeklyHours'
  | 'learningStyle'
  | 'startDate'
  | 'deadlineDate'
>;
type UnhandledGenerationErrorHandler = (
  error: unknown,
  startedAt: number,
  dbClient: AttemptsDbClient,
) => Promise<void>;

interface PreparedSessionPlan {
  planId: string;
  planStartInput: CreateLearningPlanInput;
  generationInput: ProcessGenerationInput;
  fallbackClassification: FailureClassification | 'unknown';
  onUnhandledError: UnhandledGenerationErrorHandler;
}

/**
 * Build a {@link PlanGenerationSessionBoundary}.
 *
 * Tests inject a fake `createLifecycleService` to swap the lifecycle service
 * under the boundary; production uses default `createPlanLifecycleService`
 * on the stream-scoped DB client.
 */
export function createPlanGenerationSessionBoundary(
  deps: CreateSessionBoundaryDeps = {},
): PlanGenerationSessionBoundary {
  const buildLifecycle: CreateLifecycleService =
    deps.createLifecycleService ??
    ((dbClient) => createPlanLifecycleService({ dbClient }));

  return {
    respondCreateStream: (args) =>
      run({ kind: 'create', ...args }, buildLifecycle),
    respondRetryStream: (args) =>
      run({ kind: 'retry', ...args }, buildLifecycle),
  };
}

async function run(
  command: SessionCommand,
  buildLifecycle: CreateLifecycleService,
): Promise<Response> {
  const { dbClient, cleanup } = await createStreamDbClient(command.authUserId);
  const closeStreamDb = createSafeStreamCleanup(command.authUserId, cleanup);

  try {
    const lifecycleService = buildLifecycle(dbClient);

    const prepared =
      command.kind === 'create'
        ? await prepareCreate(command, lifecycleService)
        : await prepareRetry(command);

    return await createPlanGenerationSessionResponse({
      req: command.req,
      authUserId: command.authUserId,
      dbClient,
      cleanup: closeStreamDb,
      planId: prepared.planId,
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
  command: CreateSessionCommand,
  lifecycleService: PlanLifecycleService,
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

  const modelOverride = resolveCreateStreamModel({
    req,
    authUserId,
    internalUserId,
    createResult,
    savedPreferredAiModel,
  });

  const generationInput = buildCreateGenerationInput({
    body,
    createResult,
    userId: internalUserId,
    modelOverride,
  });

  return {
    planId: createResult.planId,
    planStartInput: {
      ...body,
      topic: createResult.normalizedInput.topic,
      startDate: createResult.normalizedInput.startDate ?? undefined,
      deadlineDate: createResult.normalizedInput.deadlineDate ?? undefined,
    },
    generationInput,
    fallbackClassification: DEFAULT_PROVIDER_FAILURE_CLASSIFICATION,
    onUnhandledError: (error, startedAt, sessionDbClient) =>
      handleUnhandledStreamError({
        error,
        startedAt,
        dbClient: sessionDbClient,
        planId: createResult.planId,
        userId: internalUserId,
        classification: DEFAULT_PROVIDER_FAILURE_CLASSIFICATION,
        message:
          'Unhandled exception during stream generation; marking plan failed',
      }),
  };
}

async function prepareRetry(
  command: RetrySessionCommand,
): Promise<PreparedSessionPlan> {
  const { internalUserId, planId, plan, tierDb } = command;

  const tier = await resolveUserTier(internalUserId, tierDb);
  const retryInput = buildRetryGenerationInput(plan);

  return {
    planId,
    planStartInput: {
      ...retryInput,
      notes: undefined,
      visibility: 'private',
      origin: plan.origin ?? 'ai',
    },
    generationInput: {
      planId,
      userId: internalUserId,
      tier,
      allowedGenerationStatuses: PLAN_RETRY_RESERVATION_ALLOWED_STATUSES,
      input: retryInput,
    },
    fallbackClassification: DEFAULT_PROVIDER_FAILURE_CLASSIFICATION,
    onUnhandledError: (error, startedAt, sessionDbClient) =>
      handleUnhandledStreamError({
        error,
        startedAt,
        dbClient: sessionDbClient,
        planId,
        userId: internalUserId,
        classification: classifyError(error),
        message:
          'Unhandled exception during retry generation; marking plan failed',
      }),
  };
}

async function createPlanGenerationSessionResponse({
  req,
  authUserId,
  dbClient,
  cleanup,
  planId,
  planStartInput,
  generationInput,
  processGeneration,
  onUnhandledError,
  fallbackClassification = DEFAULT_PROVIDER_FAILURE_CLASSIFICATION,
  responseHeaders,
}: CreatePlanGenerationSessionResponseParams): Promise<Response> {
  try {
    const stream = createEventStream(
      async (emit, _controller, streamContext) => {
        const generationInputWithReservation = withPlanStartOnReservation({
          generationInput,
          planId,
          planStartInput,
          emit,
        });

        try {
          await executeLifecycleGenerationStream({
            reqSignal: req.signal,
            streamSignal: streamContext.signal,
            planId,
            userId: authUserId,
            emit,
            processGeneration: () =>
              processGeneration(generationInputWithReservation),
            onUnhandledError: async (error, startedAt) => {
              await onUnhandledError(error, startedAt, dbClient);
            },
            fallbackClassification,
          });
        } finally {
          await cleanup();
        }
      },
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

function createSafeStreamCleanup(
  authUserId: string,
  cleanup: () => Promise<void>,
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

function resolveCreateStreamModel({
  req,
  authUserId,
  internalUserId,
  createResult,
  savedPreferredAiModel,
}: {
  req: Request;
  authUserId: string;
  internalUserId: string;
  createResult: SuccessfulCreatePlanResult;
  savedPreferredAiModel: string | null;
}): string | null | undefined {
  const { modelOverride, resolutionSource, suppliedModel } =
    resolveStreamModelResolution({
      searchParams: new URL(req.url).searchParams,
      tier: createResult.tier,
      savedPreferredAiModel,
    });

  const ignoredSuppliedModel =
    suppliedModel !== undefined && resolutionSource !== 'query_override';
  let message = 'No query override or saved preference; tier default applies';
  if (resolutionSource === 'query_override') {
    message = 'Model override from query for stream generation';
  } else if (resolutionSource === 'saved_preference') {
    message = 'Using saved preferred AI model for stream generation';
  }
  const meta = {
    authUserId,
    userId: internalUserId,
    planId: createResult.planId,
    tier: createResult.tier,
    modelResolutionSource: resolutionSource,
    suppliedModel,
    ...(modelOverride !== undefined ? { modelOverride } : {}),
    ...(ignoredSuppliedModel ? { ignoredSuppliedModel: true } : {}),
  };

  if (ignoredSuppliedModel) {
    logger.warn(meta, message);
  } else {
    logger.info(meta, message);
  }

  return modelOverride;
}

function buildRetryGenerationInput(
  plan: RetryPlanGenerationPlanSnapshot,
): RetryGenerationInput {
  return {
    topic: plan.topic,
    skillLevel: plan.skillLevel,
    weeklyHours: plan.weeklyHours,
    learningStyle: plan.learningStyle,
    startDate: toIsoDateString(plan.startDate, 'startDate'),
    deadlineDate: toIsoDateString(plan.deadlineDate, 'deadlineDate'),
  };
}

function withPlanStartOnReservation({
  generationInput,
  planId,
  planStartInput,
  emit,
}: {
  generationInput: ProcessGenerationInput;
  planId: string;
  planStartInput: CreateLearningPlanInput;
  emit: (event: ReturnType<typeof buildPlanStartEvent>) => void;
}): ProcessGenerationInput {
  let planStartEmitted = false;

  return {
    ...generationInput,
    onAttemptReserved: (reservation: AttemptReservation) => {
      if (planStartEmitted) {
        logger.warn(
          {
            planId,
            attemptId: reservation.attemptId,
            attemptNumber: reservation.attemptNumber,
          },
          'plan_start reservation callback invoked more than once; ignoring duplicate',
        );
        return;
      }

      planStartEmitted = true;
      emit(
        buildPlanStartEvent({
          planId,
          attemptNumber: reservation.attemptNumber,
          input: planStartInput,
        }),
      );
    },
  };
}

async function handleUnhandledStreamError({
  error,
  startedAt,
  dbClient,
  planId,
  userId,
  classification,
  message,
}: {
  error: unknown;
  startedAt: number;
  dbClient: AttemptsDbClient;
  planId: string;
  userId: string;
  classification: FailureClassification | 'unknown';
  message: string;
}): Promise<void> {
  logger.error(
    {
      planId,
      userId,
      classification,
      durationMs: Math.max(0, Date.now() - startedAt),
      error: serializeError(error),
    },
    message,
  );

  await safeMarkPlanFailed(
    planId,
    userId,
    new PlanPersistenceAdapter(dbClient),
  );
}

function buildCreateGenerationInput({
  body,
  createResult,
  userId,
  modelOverride,
}: {
  body: CreateLearningPlanInput;
  createResult: SuccessfulCreatePlanResult;
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
  createResult: Exclude<CreatePlanResult, { status: 'success' }>,
): never {
  if (createResult.status === 'duplicate_detected') {
    throw new AppError(
      'A plan with this topic is already being generated. Please wait for it to complete.',
      {
        status: 409,
        code: 'DUPLICATE_PLAN',
        details: { existingPlanId: createResult.existingPlanId },
      },
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
  createResult: PermanentFailure | RetryableFailure,
): never {
  const error = createResult.error;
  const { status, code } =
    PLAN_CREATION_FAILURE_HTTP_MAP[createResult.classification] ??
    PLAN_CREATION_FAILURE_HTTP_MAP.unknown;

  logger.warn(
    {
      status: createResult.status,
      classification: createResult.classification,
      error: error.message,
    },
    'Plan creation failure',
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
  field: 'startDate' | 'deadlineDate',
): string | undefined {
  if (!value) {
    return undefined;
  }

  if (ISO_DATE_PATTERN.test(value)) {
    return value;
  }

  logger.warn(
    { field, value },
    'Ignoring persisted plan session date with invalid ISO calendar format',
  );
  return undefined;
}

function classifyError(error: unknown): FailureClassification | 'unknown' {
  if (error instanceof AppError) {
    return error.classification() ?? DEFAULT_PROVIDER_FAILURE_CLASSIFICATION;
  }

  if (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  ) {
    return 'timeout';
  }

  return DEFAULT_PROVIDER_FAILURE_CLASSIFICATION;
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
