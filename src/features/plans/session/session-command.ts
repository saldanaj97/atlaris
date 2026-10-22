import type { SavedGroundedModelPicks } from '@/features/ai/model-preferences';
import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { ProcessGenerationInput } from '@/features/plans/lifecycle/types';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import type { DbClient } from '@/lib/db/types';
import type { PlanGenerationCoreFieldsNormalized } from '@/shared/types/ai-provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';
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
import { resolveGroundedWriterModelId } from '@/features/ai/model-preferences';
import { resolveUserTier } from '@/features/billing/tier';
import { logger } from '@/lib/logging/logger';

/** Statuses allowed when reserving a slot for POST /plans/:id/retry (transactional re-check). */
export const PLAN_RETRY_RESERVATION_ALLOWED_STATUSES = [
  'failed',
  'pending_retry',
] as const;

/**
 * Minimal plan snapshot needed to retry generation without route-owned session wiring.
 */
export type RetryPlanGenerationPlanSnapshot =
  PlanGenerationCoreFieldsNormalized;

/**
 * Args for boundary `startCreate` — supplied after HTTP preflight.
 * `requestId` is optional for direct tests and any non-route callers; routes
 * pass request-boundary correlation ids for the generation correlation id.
 */
export interface StartCreateArgs {
  req: Request;
  authUserId: string;
  internalUserId: string;
  body: CreateLearningPlanInput;
  savedPreferredAiModel: string | null;
  /** Saved grounded picks; only the Pro writer pick is read (JCS-169). */
  savedGroundedPicks?: SavedGroundedModelPicks;
  requestId?: string;
}

/**
 * Args for boundary `startRetry` — supplied after HTTP preflight.
 * `requestId` is optional for direct tests and any non-route callers; routes
 * pass request-boundary correlation ids for the generation correlation id.
 */
export interface StartRetryArgs {
  req: Request;
  authUserId: string;
  internalUserId: string;
  planId: string;
  plan: RetryPlanGenerationPlanSnapshot;
  savedPreferredAiModel: string | null;
  /** Saved grounded picks; only the Pro writer pick is read (JCS-169). */
  savedGroundedPicks?: SavedGroundedModelPicks;
  tierDb: DbClient;
  requestId?: string;
}

export type SessionCommand =
  | ({ kind: 'create' } & StartCreateArgs)
  | ({ kind: 'retry' } & StartRetryArgs);

type CreateSessionCommand = Extract<SessionCommand, { kind: 'create' }>;
type RetrySessionCommand = Extract<SessionCommand, { kind: 'retry' }>;

export interface PreparedSessionPlan {
  planId: string;
  /**
   * Resolves the model and builds the input. It reads the model catalog, so
   * call it where a failure still runs `onUnhandledError`.
   */
  resolveGenerationInput: () => Promise<ProcessGenerationInput>;
  fallbackClassification: FailureClassification;
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
  const {
    req,
    authUserId,
    internalUserId,
    body,
    savedPreferredAiModel,
    savedGroundedPicks,
  } = command;

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

  return {
    planId: createResult.planId,
    resolveGenerationInput: async () => {
      const { modelOverride, groundedWriterModelId } =
        await resolveCreateStreamModel({
          req,
          authUserId,
          internalUserId,
          planId: createResult.planId,
          tier: createResult.tier,
          savedPreferredAiModel,
          savedGroundedPicks,
        });
      return buildCreateGenerationInput({
        body,
        createResult,
        userId: internalUserId,
        modelOverride,
        groundedWriterModelId,
      });
    },
    fallbackClassification: DEFAULT_PROVIDER_FAILURE_CLASSIFICATION,
    onUnhandledError: (error, startedAt, sessionDbClient) =>
      handleUnhandledStreamError({
        error,
        startedAt,
        dbClient: sessionDbClient,
        planId: createResult.planId,
        userId: internalUserId,
        classification: classifyUnhandledGenerationError(error),
        message:
          'Unhandled exception during stream generation; marking plan failed',
      }),
  };
}

async function prepareRetry(
  command: RetrySessionCommand,
): Promise<PreparedSessionPlan> {
  const {
    req,
    authUserId,
    internalUserId,
    planId,
    plan,
    savedPreferredAiModel,
    savedGroundedPicks,
    tierDb,
  } = command;

  const tier = await resolveUserTier(internalUserId, tierDb);
  const retryInput = buildRetryGenerationInput(plan, ({ field, value }) => {
    logger.warn(
      { field, value },
      'Ignoring persisted plan session date with invalid ISO calendar format',
    );
  });
  return {
    planId,
    resolveGenerationInput: async () => {
      const { modelOverride, groundedWriterModelId } =
        await resolveCreateStreamModel({
          req,
          authUserId,
          internalUserId,
          planId,
          tier,
          savedPreferredAiModel,
          savedGroundedPicks,
        });
      return {
        planId,
        userId: internalUserId,
        tier,
        generationPurpose: 'initial',
        allowedGenerationStatuses: PLAN_RETRY_RESERVATION_ALLOWED_STATUSES,
        input: retryInput,
        modelOverride,
        groundedWriterModelId,
      };
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

async function resolveCreateStreamModel({
  req,
  authUserId,
  internalUserId,
  planId,
  tier,
  savedPreferredAiModel,
  savedGroundedPicks,
}: {
  req: Request;
  authUserId: string;
  internalUserId: string;
  planId: string;
  tier: SubscriptionTier;
  savedPreferredAiModel: string | null;
  savedGroundedPicks: SavedGroundedModelPicks | undefined;
}): Promise<{ modelOverride?: string; groundedWriterModelId: string | null }> {
  const { modelOverride, resolutionSource, suppliedModel } =
    await resolveStreamModelResolution({
      searchParams: new URL(req.url).searchParams,
      tier,
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
    planId,
    tier,
    modelResolutionSource: resolutionSource,
    suppliedModel,
    ...(modelOverride !== undefined ? { modelOverride } : {}),
    ...(ignoredSuppliedModel ? { ignoredSuppliedModel: true } : {}),
  };

  logger[ignoredSuppliedModel ? 'warn' : 'info'](meta, message);

  // Grounded outlines take a valid `?model=` override, else the Pro writer
  // pick; the legacy saved outline model never applies to them (JCS-169).
  const groundedWriterModelId = resolveGroundedWriterModelId(
    tier,
    resolutionSource === 'query_override' ? modelOverride : undefined,
    savedGroundedPicks ?? NO_GROUNDED_PICKS,
  );

  return { modelOverride, groundedWriterModelId };
}

const NO_GROUNDED_PICKS: SavedGroundedModelPicks = {
  preferredWriterAiModel: null,
  preferredVerifierAiModel: null,
  preferredAdvisorAiModel: null,
};
