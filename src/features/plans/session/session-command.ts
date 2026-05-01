import { resolveUserTier } from '@/features/billing/tier';
import { logger } from '@/lib/logging/logger';

import type { PlansDbClient } from '@/features/plans/api/route-context';
import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type {
  CreatePlanResult,
  ProcessGenerationInput,
} from '@/features/plans/lifecycle/types';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import type { PlanGenerationCoreFieldsNormalized } from '@/shared/types/ai-provider.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';

import { throwCreatePlanResultError } from './create-plan-result-error';
import {
  buildCreateGenerationInput,
  buildRetryGenerationInput,
} from './generation-input';
import { resolveStreamModelResolution } from './model-resolution';
import {
  DEFAULT_PROVIDER_FAILURE_CLASSIFICATION,
  handleUnhandledStreamError,
  type UnhandledGenerationErrorHandler,
  classifyUnhandledGenerationError,
} from './stream-cleanup-policy';

/** Statuses allowed when reserving a slot for POST /plans/:id/retry (transactional re-check). */
export const PLAN_RETRY_RESERVATION_ALLOWED_STATUSES = [
  'failed',
  'pending_retry',
] as const;

/**
 * Minimal plan snapshot needed to retry generation without route-owned session wiring.
 */
export interface RetryPlanGenerationPlanSnapshot extends PlanGenerationCoreFieldsNormalized {
  origin: 'ai' | 'manual' | 'template' | null;
}

/**
 * Args for boundary `respondCreateStream` — supplied after HTTP preflight.
 * `requestId` is optional for direct tests and any non-route callers; routes
 * pass request-boundary correlation ids so SSE errors can include them.
 */
export interface RespondCreateStreamArgs {
  req: Request;
  authUserId: string;
  internalUserId: string;
  body: CreateLearningPlanInput;
  savedPreferredAiModel: string | null;
  responseHeaders?: HeadersInit;
  requestId?: string;
}

/**
 * Args for boundary `respondRetryStream` — supplied after HTTP preflight.
 * `requestId` is optional for direct tests and any non-route callers; routes
 * pass request-boundary correlation ids so SSE errors can include them.
 */
export interface RespondRetryStreamArgs {
  req: Request;
  authUserId: string;
  internalUserId: string;
  planId: string;
  plan: RetryPlanGenerationPlanSnapshot;
  tierDb: PlansDbClient;
  responseHeaders?: HeadersInit;
  requestId?: string;
}

export type SessionCommand =
  | ({ kind: 'create' } & RespondCreateStreamArgs)
  | ({ kind: 'retry' } & RespondRetryStreamArgs);

type CreateSessionCommand = Extract<SessionCommand, { kind: 'create' }>;
type RetrySessionCommand = Extract<SessionCommand, { kind: 'retry' }>;

type SuccessfulCreatePlanResult = Extract<
  CreatePlanResult,
  { status: 'success' }
>;

export interface PreparedSessionPlan {
  planId: string;
  planStartInput: CreateLearningPlanInput;
  generationInput: ProcessGenerationInput;
  fallbackClassification: FailureClassification | 'unknown';
  onUnhandledError: UnhandledGenerationErrorHandler;
}

export async function preparePlanGenerationSessionCommand({
  command,
  lifecycleService,
}: {
  command: SessionCommand;
  lifecycleService: PlanLifecycleService;
}): Promise<PreparedSessionPlan> {
  return command.kind === 'create'
    ? prepareCreate(command, lifecycleService)
    : prepareRetry(command);
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
  const retryInput = buildRetryGenerationInput(plan, ({ field, value }) => {
    logger.warn(
      { field, value },
      'Ignoring persisted plan session date with invalid ISO calendar format',
    );
  });

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
        classification: classifyUnhandledGenerationError(error),
        message:
          'Unhandled exception during retry generation; marking plan failed',
      }),
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
}): string | undefined {
  const { modelOverride, resolutionSource, suppliedModel } =
    resolveStreamModelResolution({
      searchParams: new URL(req.url).searchParams,
      tier: createResult.tier,
      savedPreferredAiModel,
    });

  const ignoredSuppliedModel =
    suppliedModel !== undefined && resolutionSource !== 'query_override';
  const message =
    resolutionSource === 'query_override'
      ? 'Model override from query for stream generation'
      : resolutionSource === 'saved_preference'
        ? 'Using saved preferred AI model for stream generation'
        : 'No query override or saved preference; tier default applies';
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

  logger[ignoredSuppliedModel ? 'warn' : 'info'](meta, message);

  return modelOverride;
}
