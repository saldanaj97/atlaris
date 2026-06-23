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
  GenerationAttemptRecord,
  ReserveAttemptSlotParams,
} from '@/lib/db/queries/types/attempts.types';
import type { GenerationInput } from '@/shared/types/ai-provider.types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';

import { checkCreationGate } from './creation-pipeline';
import { type CreationGatePorts } from './creation-pipeline';
import { createAiPlanWithStrategy } from './origin-strategies/create-ai-plan';
import { logger } from '@/lib/logging/logger';
import { countMetric, distributionMetric } from '@/lib/observability/metrics';
import { isRetryableClassification } from '@/shared/types/failure-classification';

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
      weeklyHours: number;
      totalWeeks: number;
    },
  ): DurationCapResult;

  normalizePlanDuration(
    this: void,
    params: {
      tier: SubscriptionTier;
      weeklyHours: number;
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
  modelOverride?: string;
  signal?: AbortSignal;
  allowedGenerationStatuses?: ReserveAttemptSlotParams['allowedGenerationStatuses'];
  requiredGenerationStatus?: ReserveAttemptSlotParams['requiredGenerationStatus'];
  onAttemptReserved?: (reservation: AttemptReservation) => void;
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
  metadata: Record<string, unknown>;
  usage: CanonicalAIUsage;
  durationMs: number;
  reservation: AttemptReservation;
  extendedTimeout: boolean;
};

type GenerationRunFailure = {
  status: 'failure';
  classification: FailureClassification;
  error: Error;
  metadata?: Record<string, unknown>;
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
  return reason !== 'in_progress' && reason !== 'invalid_status';
}

function deterministicCompletedAt(startedAt: Date, durationMs: number): string {
  const safeDurationMs = Number.isFinite(durationMs) ? durationMs : 0;
  return new Date(
    startedAt.getTime() + Math.max(0, safeDurationMs),
  ).toISOString();
}

export class PlanLifecycleService {
  private readonly ports: PlanLifecycleServicePorts;

  constructor(ports: PlanLifecycleServicePorts) {
    this.ports = ports;
  }

  private creationGatePorts(): CreationGatePorts {
    return {
      findCappedPlanWithoutModules: (userId: string) =>
        this.ports.planPersistence.findCappedPlanWithoutModules(userId),
      resolveUserTier: (userId: string) =>
        this.ports.quota.resolveUserTier(userId),
      checkDurationCap: (params) => this.ports.quota.checkDurationCap(params),
      normalizePlanDuration: (params) =>
        this.ports.quota.normalizePlanDuration(params),
    };
  }

  /**
   * Create a new AI-origin learning plan.
   *
   * Flow: validate → resolve tier → check requested duration cap → normalize duration
   *       → check normalized duration cap → check attempt cap → prepare input → atomic insert
   *
   * @returns A discriminated union result — never throws for lifecycle outcomes.
   */
  async createPlan(input: CreateAiPlanInput): Promise<CreatePlanResult> {
    const gate = await checkCreationGate(this.creationGatePorts(), {
      userId: input.userId,
      weeklyHours: input.weeklyHours,
      startDate: input.startDate ?? null,
      deadlineDate: input.deadlineDate ?? null,
      lifecycleLabel: 'create',
    });
    if (gate.blocked) {
      return gate.result;
    }

    return createAiPlanWithStrategy(this.ports, {
      input,
      tier: gate.tier,
      duration: gate.duration,
    });
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

  private async processGenerationAttemptInternal(
    input: ProcessGenerationInput,
    existingReservation?: AttemptReservation,
  ): Promise<GenerationAttemptResult> {
    const { planId, userId, tier } = input;

    logger.info(
      { planId, userId, tier },
      'plan.lifecycle.generation: attempt started',
    );

    const generationResult = await this.ports.generation.runGeneration({
      planId: input.planId,
      userId: input.userId,
      tier: input.tier,
      input: input.input,
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
      });

      logger.info({ planId, durationMs }, 'plan.lifecycle.generation: success');
      countMetric('atlaris.plan.generation.success', 1, {
        attributes: {
          tier,
          extended_timeout: extendedTimeout,
        },
      });
      distributionMetric('atlaris.plan.generation.duration_ms', durationMs, {
        unit: 'millisecond',
        attributes: {
          status: 'success',
          tier,
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
