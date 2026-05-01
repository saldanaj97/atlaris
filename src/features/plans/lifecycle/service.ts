import { logger } from '@/lib/logging/logger';
import { isRetryableClassification } from '@/shared/types/failure-classification';
import { checkCreationGate } from './creation-pipeline';
import { createAiPlanWithStrategy } from './origin-strategies/create-ai-plan';

import { type CreationGatePorts } from './creation-pipeline';
import type {
  GenerationFinalizationPort,
  GenerationPort,
  GenerationRunResult,
  PlanPersistencePort,
  QuotaPort,
} from './ports';
import type {
  CreateAiPlanInput,
  CreatePlanResult,
  GenerationAttemptResult,
  ProcessGenerationInput,
} from './types';

/**
 * PlanLifecycleService — orchestrates plan creation through port interfaces.
 *
 * This service has ZERO direct imports from billing, AI, DB, or job modules.
 * All interaction with external concerns goes through injected ports.
 *
 * Returns discriminated union results for expected lifecycle outcomes.
 * Generation finalization can throw on DB/RLS/infra errors after provider success;
 * stream and worker layers treat those as unexpected failures.
 */

export interface PlanLifecycleServicePorts {
  readonly planPersistence: PlanPersistencePort;
  readonly quota: QuotaPort;
  readonly generation: GenerationPort;
  readonly generationFinalization: GenerationFinalizationPort;
}

function shouldMarkPlanFailedAfterGenerationFailure(
  result: Extract<GenerationRunResult, { status: 'failure' }>,
): boolean {
  const reason = result.reservationRejectionReason;
  // Only skip settlement when another attempt still holds the in-progress slot.
  // invalid_status (e.g. retry while plan still generating) must still run
  // finalizeFailure(plan_only) or the plan stays stuck in `generating`.
  return reason !== 'in_progress';
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
    const { planId, userId, tier } = input;

    logger.info(
      { planId, userId, tier },
      'plan.lifecycle.generation: attempt started',
    );

    const generationResult = await this.ports.generation.runGeneration(input);

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
        usageKind: 'plan',
      });

      logger.info({ planId, durationMs }, 'plan.lifecycle.generation: success');
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
    return {
      status: 'permanent_failure',
      classification,
      error,
    };
  }
}
