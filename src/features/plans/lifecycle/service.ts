import type {
  FinalizeGenerationFailureParams,
  FinalizeGenerationSuccessInput,
} from './generation-finalization/types';
import type {
  AtomicInsertResult,
  CreateAiPlanInput,
  CreatePlanResult,
  DurationCapResult,
  GeneratedModule,
  GenerationAttemptResult,
  NormalizedDuration,
  PlanInsertData,
  ProcessGenerationInput,
} from './types';
import type {
  AttemptRejection,
  AttemptReservation,
  AttemptWorkflowMetadata,
  GenerationAttemptRecord,
  ReserveAttemptSlotParams,
} from '@/lib/db/queries/types/attempts.types';
import type {
  GenerationInput,
  ProviderMetadata,
} from '@/shared/types/ai-provider.types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';

import { createReservationRejectionResult } from '@/features/ai/orchestrator/reservation';
import { calculateTotalWeeks } from '@/features/plans/policy/duration';
import { logger } from '@/lib/logging/logger';
import { countMetric, distributionMetric } from '@/lib/observability/metrics';
import { isRetryableClassification } from '@/shared/types/failure-classification';
import {
  describeGenerationPurpose,
  parseGenerationPurpose,
  type GenerationPurpose,
} from '@/shared/types/generation-purpose';

export interface PlanLifecyclePersistence {
  atomicInsertPlan(
    this: void,
    userId: string,
    planData: PlanInsertData,
  ): Promise<AtomicInsertResult>;

  findCappedPlanWithoutModules(
    this: void,
    userId: string,
  ): Promise<string | null>;

  markGenerationSuccess(this: void, planId: string): Promise<void>;
  markGenerationFailure(this: void, planId: string): Promise<void>;
}

export type PlanGenerationFailureMarker = Pick<
  PlanLifecyclePersistence,
  'markGenerationFailure'
>;

export interface PlanLifecycleQuota {
  resolveUserTier(this: void, userId: string): Promise<SubscriptionTier>;

  checkDurationCap(
    this: void,
    params: {
      tier: SubscriptionTier;
      totalWeeks: number;
    },
  ): DurationCapResult;

  normalizePlanDuration(
    this: void,
    params: {
      startDate?: string | null;
      deadlineDate?: string | null;
      today?: Date;
    },
  ): NormalizedDuration;
}

export type GenerationRunParams = {
  planId: string;
  userId: string;
  tier: SubscriptionTier;
  input: Readonly<GenerationInput>;
  generationPurpose: GenerationPurpose;
  modelOverride?: string;
  signal?: AbortSignal;
  allowedGenerationStatuses?: ReserveAttemptSlotParams['allowedGenerationStatuses'];
  requiredGenerationStatus?: ReserveAttemptSlotParams['requiredGenerationStatus'];
  onAttemptReserved?: (reservation: AttemptReservation) => void | Promise<void>;
  /**
   * When set, skips `reserveAttemptSlot` so workflow replay (activity retry or
   * worker recovery) does not double-reserve. Implementations must validate the
   * reservation against current DB state before provider work.
   */
  reservation?: AttemptReservation;
};

type GenerationRunSuccess = {
  status: 'success';
  modules: GeneratedModule[];
  metadata: ProviderMetadata;
  usage: CanonicalAIUsage;
  durationMs: number;
  reservation: AttemptReservation;
  extendedTimeout: boolean;
};

type GenerationRunFailure = {
  status: 'failure';
  classification: FailureClassification;
  error: Error;
  metadata?: ProviderMetadata;
  usage?: CanonicalAIUsage;
  durationMs: number;
  reservation?: AttemptReservation;
  timedOut?: boolean;
  extendedTimeout?: boolean;
  reservationRejectionReason?: AttemptRejection['reason'];
};

type GenerationRunAlreadyFinalized = {
  status: 'already_finalized';
  planId: string;
  outcome?: 'success' | 'failure';
  classification?: FailureClassification | 'unknown';
  error?: Error;
};

export type GenerationRunResult =
  | GenerationRunSuccess
  | GenerationRunFailure
  | GenerationRunAlreadyFinalized;

export interface PlanLifecycleGeneration {
  runGeneration(
    this: void,
    params: GenerationRunParams,
  ): Promise<GenerationRunResult>;
}

export interface PlanLifecycleFinalization {
  finalizeSuccess(
    this: void,
    input: FinalizeGenerationSuccessInput,
  ): Promise<GenerationAttemptRecord>;

  finalizeFailure(
    this: void,
    input: FinalizeGenerationFailureParams,
  ): Promise<GenerationAttemptRecord | void>;
}

/**
 * PlanLifecycleService — orchestrates plan creation and generation attempts.
 *
 * This service keeps external concerns behind injected collaborators.
 *
 * Returns discriminated union results for expected lifecycle outcomes.
 * Generation finalization can throw on DB/RLS/infra errors after provider success;
 * stream and worker layers treat those as unexpected failures.
 */

export interface PlanLifecycleServicePorts {
  readonly planPersistence: PlanLifecyclePersistence;
  readonly quota: PlanLifecycleQuota;
  readonly generation: PlanLifecycleGeneration;
  readonly generationFinalization: PlanLifecycleFinalization;
}

function shouldMarkPlanFailedAfterGenerationFailure(
  result: Extract<GenerationRunResult, { status: 'failure' }>,
): boolean {
  const reason = result.reservationRejectionReason;
  return (
    reason !== 'in_progress' &&
    reason !== 'invalid_status' &&
    reason !== 'active_child_generation'
  );
}

function deterministicCompletedAt(startedAt: Date, durationMs: number): string {
  const safeDurationMs = Number.isFinite(durationMs) ? durationMs : 0;
  return new Date(
    startedAt.getTime() + Math.max(0, safeDurationMs),
  ).toISOString();
}

const CREATE_LOG_BASE = 'plan.lifecycle.create';

export class PlanLifecycleService {
  private readonly ports: PlanLifecycleServicePorts;

  constructor(ports: PlanLifecycleServicePorts) {
    this.ports = ports;
  }

  /**
   * Create a new AI-origin learning plan.
   *
   * Flow: check attempt cap → resolve tier → check requested duration cap →
   *       normalize duration → check normalized duration cap → validate topic →
   *       atomic insert
   *
   * @returns A discriminated union result — never throws for lifecycle outcomes.
   */
  async createPlan(input: CreateAiPlanInput): Promise<CreatePlanResult> {
    const { userId } = input;
    const startDate = input.startDate ?? null;
    const deadlineDate = input.deadlineDate ?? null;

    const cappedPlanId =
      await this.ports.planPersistence.findCappedPlanWithoutModules(userId);
    if (cappedPlanId) {
      logger.info(
        { userId, cappedPlanId },
        `${CREATE_LOG_BASE}: attempt cap exceeded (existing capped plan)`,
      );
      return {
        status: 'attempt_cap_exceeded',
        reason: `Existing plan ${cappedPlanId} has exhausted generation attempts. Please delete it or retry before creating a new plan.`,
        cappedPlanId,
      };
    }

    const tier = await this.ports.quota.resolveUserTier(userId);
    logger.info({ userId, tier }, `${CREATE_LOG_BASE}: tier resolved`);

    const requestedWeeks = calculateTotalWeeks({
      startDate,
      deadlineDate,
    });
    const requestedCap = this.ports.quota.checkDurationCap({
      tier,
      totalWeeks: requestedWeeks,
    });
    if (!requestedCap.allowed) {
      logger.info(
        { userId, tier },
        `${CREATE_LOG_BASE}: duration exceeded (requested duration cap)`,
      );
      return {
        status: 'duration_exceeded',
        reason: requestedCap.reason ?? 'Plan duration exceeds tier limits',
        upgradeUrl: requestedCap.upgradeUrl,
      };
    }

    const duration = this.ports.quota.normalizePlanDuration({
      startDate,
      deadlineDate,
    });

    const durationCap = this.ports.quota.checkDurationCap({
      tier,
      totalWeeks: duration.totalWeeks,
    });
    if (!durationCap.allowed) {
      logger.info(
        { userId, tier },
        `${CREATE_LOG_BASE}: duration exceeded (normalized duration cap)`,
      );
      return {
        status: 'duration_exceeded',
        reason: durationCap.reason ?? 'Plan duration exceeds tier limits',
        upgradeUrl: durationCap.upgradeUrl,
      };
    }

    if (!input.topic || input.topic.trim().length < 3) {
      logger.warn({ userId }, `${CREATE_LOG_BASE}: validation failed`);
      return {
        status: 'permanent_failure',
        classification: 'validation',
        error: new Error(
          'Topic is required and must be at least 3 characters for AI-origin plans.',
        ),
      };
    }

    const normalizedTopic = input.topic.trim();
    const planData: PlanInsertData = {
      topic: normalizedTopic,
      skillLevel: input.skillLevel,
      weeklyHours: input.weeklyHours,
      learningStyle: input.learningStyle,
      visibility: 'private',
      origin: 'ai',
      startDate: duration.startDate,
      deadlineDate: duration.deadlineDate,
    };
    const normalizedInput = {
      topic: normalizedTopic,
      skillLevel: input.skillLevel,
      weeklyHours: input.weeklyHours,
      learningStyle: input.learningStyle,
      startDate: duration.startDate,
      deadlineDate: duration.deadlineDate,
    };

    const insertResult = await this.ports.planPersistence.atomicInsertPlan(
      userId,
      planData,
    );

    if (insertResult.status === 'duplicate') {
      logger.info(
        { userId, existingPlanId: insertResult.existingPlanId },
        `${CREATE_LOG_BASE}: duplicate detected`,
      );
      return {
        status: 'duplicate_detected',
        existingPlanId: insertResult.existingPlanId,
      };
    }

    if (insertResult.status === 'limit_reached') {
      logger.info(
        { userId },
        `${CREATE_LOG_BASE}: quota rejected (plan limit)`,
      );
      return {
        status: 'quota_rejected',
        reason: 'Plan limit reached for current subscription tier',
      };
    }

    if (insertResult.status === 'free_allowance_used') {
      logger.info({ userId }, `${CREATE_LOG_BASE}: free plan allowance used`);
      return {
        status: 'free_allowance_used',
        reason:
          'Your free plan allowance has already been used. Upgrade to create another plan.',
        upgradeUrl: '/pricing',
      };
    }

    if (insertResult.status === 'free_generation_in_progress') {
      logger.info(
        { userId },
        `${CREATE_LOG_BASE}: free initial generation in progress`,
      );
      return {
        status: 'free_generation_in_progress',
        reason:
          'A free plan is already being generated. Wait for it to finish or fail before starting another.',
      };
    }

    logger.info(
      { userId, planId: insertResult.id, tier, origin: planData.origin },
      `${CREATE_LOG_BASE}: plan created`,
    );
    countMetric('atlaris.plan.created', 1, {
      attributes: {
        origin: planData.origin,
        tier,
      },
    });
    return {
      status: 'success',
      planId: insertResult.id,
      tier,
      normalizedInput,
    };
  }

  /**
   * Process a generation attempt for an existing plan.
   *
   * Flow: run generation (unfinalized) → single-transaction finalization (attempt + plan + usage)
   *       → on retryable failure: mark failed via finalization (no usage)
   *       → on permanent failure: mark failed + usage via finalization when usage exists
   *
   * @returns A discriminated union result for expected lifecycle outcomes.
   * @throws When post-provider finalization fails (DB commit, RLS, etc.).
   */
  async processGenerationAttempt(
    input: ProcessGenerationInput,
  ): Promise<GenerationAttemptResult> {
    return this.processGenerationAttemptInternal(input);
  }

  /**
   * Same as {@link processGenerationAttempt} but reuses an existing reservation
   * (for Workflow SDK replay after claim).
   *
   * Safe for workflow replay because it does not call `reserveAttemptSlot`
   * again; the generation port validates the reservation against current DB
   * state before provider work.
   */
  async processGenerationAttemptWithReservation(
    input: ProcessGenerationInput,
    reservation: AttemptReservation,
  ): Promise<GenerationAttemptResult> {
    return this.processGenerationAttemptInternal(input, reservation);
  }

  /**
   * Settles a reservation rejection without reserving again.
   * Stream/workflow wrappers that already called `reserveAttemptSlot` must use
   * this instead of {@link processGenerationAttempt}.
   */
  async settleReservationRejection(
    input: ProcessGenerationInput,
    rejection: AttemptRejection,
    timing: {
      readonly startedAt: number;
      readonly clock: () => number;
    },
  ): Promise<GenerationAttemptResult> {
    const generationPurpose = parseGenerationPurpose(input.generationPurpose);
    const nowFn = () => new Date();
    const result = createReservationRejectionResult(
      {
        planId: input.planId,
        userId: input.userId,
        input: input.input,
        generationPurpose,
      },
      rejection,
      timing.startedAt,
      timing.clock,
      nowFn,
    );

    return this.settleGenerationFailure(input, {
      status: 'failure',
      classification: result.classification,
      error: result.error,
      durationMs: result.durationMs,
      timedOut: result.timedOut,
      extendedTimeout: result.extendedTimeout,
      ...(result.reservationRejectionReason !== undefined
        ? { reservationRejectionReason: result.reservationRejectionReason }
        : {}),
    });
  }

  /**
   * Settles a reserved attempt that failed before provider work (workflow-start
   * failure, regeneration admission-deny). Production callers must use this
   * instead of `commitPlanGenerationFailure`.
   */
  async settleReservedAttemptFailure(input: {
    readonly reservation: AttemptReservation;
    readonly planId: string;
    readonly userId: string;
    readonly error: Error;
    readonly classification: FailureClassification;
    readonly generationPurpose: GenerationPurpose;
    readonly retryable: boolean;
    readonly durationMs?: number;
    readonly timedOut?: boolean;
    readonly extendedTimeout?: boolean;
    readonly workflowMetadata?: AttemptWorkflowMetadata;
  }): Promise<void> {
    const durationMs = input.durationMs ?? 0;
    await this.ports.generationFinalization.finalizeFailure({
      variant: 'reserved_attempt',
      planId: input.planId,
      userId: input.userId,
      attemptId: input.reservation.attemptId,
      preparation: input.reservation,
      classification: input.classification,
      error: input.error,
      durationMs,
      timedOut: input.timedOut ?? false,
      extendedTimeout: input.extendedTimeout ?? false,
      usageKind: 'plan',
      generationPurpose: parseGenerationPurpose(input.generationPurpose),
      retryable: input.retryable,
      ...(input.workflowMetadata
        ? {
            workflowMetadata: {
              ...input.workflowMetadata,
              completedAt: deterministicCompletedAt(
                input.reservation.startedAt,
                durationMs,
              ),
            },
          }
        : {}),
    });
  }

  private async processGenerationAttemptInternal(
    input: ProcessGenerationInput,
    existingReservation?: AttemptReservation,
  ): Promise<GenerationAttemptResult> {
    const { planId, userId, tier } = input;
    const generationPurpose = parseGenerationPurpose(input.generationPurpose);

    logger.info(
      {
        planId,
        userId,
        tier,
        generationPurpose: describeGenerationPurpose(generationPurpose),
      },
      'plan.lifecycle.generation: attempt started',
    );

    const generationResult = await this.ports.generation.runGeneration({
      planId: input.planId,
      userId: input.userId,
      tier: input.tier,
      input: input.input,
      generationPurpose,
      signal: input.signal,
      allowedGenerationStatuses: input.allowedGenerationStatuses,
      requiredGenerationStatus: input.requiredGenerationStatus,
      onAttemptReserved: input.onAttemptReserved,
      ...(existingReservation ? { reservation: existingReservation } : {}),
      ...(input.modelOverride !== undefined
        ? { modelOverride: input.modelOverride }
        : {}),
    });

    if (generationResult.status === 'already_finalized') {
      if (generationResult.outcome === 'failure') {
        const classification = generationResult.classification ?? 'unknown';
        const error =
          generationResult.error ??
          new Error(
            `Generation attempt for plan ${generationResult.planId} was already finalized as a failure (${classification}).`,
          );
        const retryable = isRetryableClassification(classification);

        logger.info(
          {
            planId,
            userId,
            classification,
            retryable,
          },
          'plan.lifecycle.generation: recovered finalized failure — skipping provider work',
        );

        return retryable
          ? { status: 'retryable_failure', classification, error }
          : { status: 'permanent_failure', classification, error };
      }

      logger.info(
        { planId, userId },
        'plan.lifecycle.generation: already finalized — skipping provider work',
      );
      return {
        status: 'already_finalized',
        planId: generationResult.planId,
      };
    }

    if (generationResult.status === 'success') {
      const {
        reservation,
        modules,
        metadata: providerMetadata,
        usage,
        durationMs,
        extendedTimeout,
      } = generationResult;

      await this.ports.generationFinalization.finalizeSuccess({
        planId,
        userId,
        attemptId: reservation.attemptId,
        preparation: reservation,
        modules,
        providerMetadata,
        usage,
        durationMs,
        extendedTimeout,
        ...(input.workflowMetadata
          ? {
              workflowMetadata: {
                ...input.workflowMetadata,
                completedAt: deterministicCompletedAt(
                  reservation.startedAt,
                  durationMs,
                ),
              },
            }
          : {}),
        usageKind: 'plan',
        generationPurpose,
      });

      logger.info(
        {
          planId,
          durationMs,
          generationPurpose: describeGenerationPurpose(generationPurpose),
        },
        'plan.lifecycle.generation: success',
      );
      countMetric('atlaris.plan.generation.success', 1, {
        attributes: {
          tier,
          generation_purpose: describeGenerationPurpose(generationPurpose),
          extended_timeout: extendedTimeout,
        },
      });
      distributionMetric('atlaris.plan.generation.duration_ms', durationMs, {
        unit: 'millisecond',
        attributes: {
          status: 'success',
          tier,
          generation_purpose: describeGenerationPurpose(generationPurpose),
          extended_timeout: extendedTimeout,
        },
      });
      return {
        status: 'generation_success',
        data: {
          modules,
          metadata: providerMetadata,
          durationMs,
        },
      };
    }

    return this.settleGenerationFailure(input, generationResult);
  }

  private async settleGenerationFailure(
    input: ProcessGenerationInput,
    generationResult: Extract<GenerationRunResult, { status: 'failure' }>,
  ): Promise<GenerationAttemptResult> {
    const { planId, userId, tier } = input;
    const generationPurpose = parseGenerationPurpose(input.generationPurpose);
    const { classification, error } = generationResult;
    const retryable = isRetryableClassification(classification);

    if (shouldMarkPlanFailedAfterGenerationFailure(generationResult)) {
      const failureCommon = {
        planId,
        userId,
        classification,
        error,
        durationMs: generationResult.durationMs,
        usage: generationResult.usage,
        usageKind: 'plan' as const,
        generationPurpose,
        retryable,
      };

      // Reservation rejection means no attempt row was acquired. A reservation
      // means provider/validation failed after acquisition, so finalize the
      // reserved attempt. Missing both points to an upstream context bug.
      if (generationResult.reservationRejectionReason !== undefined) {
        await this.ports.generationFinalization.finalizeFailure({
          variant: 'plan_only',
          ...failureCommon,
        });
      } else if (generationResult.reservation) {
        const { reservation } = generationResult;
        await this.ports.generationFinalization.finalizeFailure({
          variant: 'reserved_attempt',
          ...failureCommon,
          attemptId: reservation.attemptId,
          preparation: reservation,
          timedOut: generationResult.timedOut ?? false,
          extendedTimeout: generationResult.extendedTimeout ?? false,
          providerMetadata: generationResult.metadata,
          ...(input.workflowMetadata
            ? {
                workflowMetadata: {
                  ...input.workflowMetadata,
                  completedAt: deterministicCompletedAt(
                    reservation.startedAt,
                    generationResult.durationMs,
                  ),
                },
              }
            : {}),
        });
      } else {
        logger.error(
          { planId, userId, classification },
          'plan.lifecycle.generation: failure result missing reservation context',
        );
        throw new Error(
          `Generation failure for plan ${planId} did not include reservation context.`,
        );
      }
    }

    if (retryable) {
      logger.warn(
        { planId, classification },
        'plan.lifecycle.generation: retryable failure',
      );
      countMetric('atlaris.plan.generation.failure', 1, {
        attributes: {
          classification,
          retryable: true,
          tier,
          generation_purpose: describeGenerationPurpose(generationPurpose),
        },
      });
      distributionMetric(
        'atlaris.plan.generation.duration_ms',
        generationResult.durationMs,
        {
          unit: 'millisecond',
          attributes: {
            status: 'failure',
            classification,
            retryable: true,
            tier,
            generation_purpose: describeGenerationPurpose(generationPurpose),
          },
        },
      );
      return {
        status: 'retryable_failure',
        classification,
        error,
      };
    }

    logger.warn(
      { planId, classification },
      'plan.lifecycle.generation: permanent failure',
    );
    countMetric('atlaris.plan.generation.failure', 1, {
      attributes: {
        classification,
        retryable: false,
        tier,
        generation_purpose: describeGenerationPurpose(generationPurpose),
      },
    });
    distributionMetric(
      'atlaris.plan.generation.duration_ms',
      generationResult.durationMs,
      {
        unit: 'millisecond',
        attributes: {
          status: 'failure',
          classification,
          retryable: false,
          tier,
          generation_purpose: describeGenerationPurpose(generationPurpose),
        },
      },
    );
    return {
      status: 'permanent_failure',
      classification,
      error,
    };
  }
}
