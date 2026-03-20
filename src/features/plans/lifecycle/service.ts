/**
 * PlanLifecycleService — orchestrates plan creation through port interfaces.
 *
 * This service has ZERO direct imports from billing, AI, DB, or job modules.
 * All interaction with external concerns goes through injected ports.
 *
 * Returns discriminated union results for expected lifecycle outcomes.
 * Only unexpected errors (bugs) propagate as thrown exceptions.
 */

import { calculateTotalWeeks } from '@/features/plans/api/shared';
import { logger } from '@/lib/logging/logger';

import type {
  GenerationPort,
  JobQueuePort,
  PdfOriginPort,
  PlanPersistencePort,
  QuotaPort,
  UsageRecordingPort,
} from './ports';
import type {
  CreateAiPlanInput,
  CreatePdfPlanInput,
  CreatePlanResult,
  GenerationAttemptResult,
  PdfContext,
  ProcessGenerationInput,
} from './types';
import { isRetryableClassification } from './types';

export interface PlanLifecycleServicePorts {
  readonly planPersistence: PlanPersistencePort;
  readonly quota: QuotaPort;
  readonly pdfOrigin: PdfOriginPort;
  readonly generation: GenerationPort;
  readonly usageRecording: UsageRecordingPort;
  readonly jobQueue: JobQueuePort;
}

export class PlanLifecycleService {
  private readonly ports: PlanLifecycleServicePorts;

  constructor(ports: PlanLifecycleServicePorts) {
    this.ports = ports;
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
    // 1. Validate input
    if (!input.topic || input.topic.trim().length < 3) {
      logger.warn(
        { userId: input.userId },
        'plan.lifecycle.create: validation failed'
      );
      return {
        status: 'permanent_failure',
        classification: 'validation',
        error: new Error(
          'Topic is required and must be at least 3 characters for AI-origin plans.'
        ),
      };
    }

    // 2. Resolve tier
    const tier = await this.ports.quota.resolveUserTier(input.userId);
    logger.info(
      { userId: input.userId, tier },
      'plan.lifecycle.create: tier resolved'
    );

    // 3. Reject raw requested range before tier normalization (normalization clamps dates and would hide over-limit requests)
    const requestedWeeks = calculateTotalWeeks({
      startDate: input.startDate ?? null,
      deadlineDate: input.deadlineDate ?? null,
    });
    const requestedCap = this.ports.quota.checkDurationCap({
      tier,
      weeklyHours: input.weeklyHours,
      totalWeeks: requestedWeeks,
    });
    if (!requestedCap.allowed) {
      logger.info(
        { userId: input.userId, tier },
        'plan.lifecycle.create: quota rejected (requested duration cap)'
      );
      return {
        status: 'quota_rejected',
        reason: requestedCap.reason ?? 'Plan duration exceeds tier limits',
        upgradeUrl: requestedCap.upgradeUrl,
      };
    }

    // 4. Normalize plan duration for the tier
    const duration = this.ports.quota.normalizePlanDuration({
      tier,
      weeklyHours: input.weeklyHours,
      startDate: input.startDate,
      deadlineDate: input.deadlineDate,
    });

    // 5. Check duration cap on normalized duration
    const durationCap = this.ports.quota.checkDurationCap({
      tier,
      weeklyHours: input.weeklyHours,
      totalWeeks: duration.totalWeeks,
    });

    if (!durationCap.allowed) {
      logger.info(
        { userId: input.userId, tier },
        'plan.lifecycle.create: quota rejected (normalized duration cap)'
      );
      return {
        status: 'quota_rejected',
        reason: durationCap.reason ?? 'Plan duration exceeds tier limits',
        upgradeUrl: durationCap.upgradeUrl,
      };
    }

    // 6. Check for capped plan (exhausted generation attempts)
    const cappedPlanId =
      await this.ports.planPersistence.findCappedPlanWithoutModules(
        input.userId
      );
    if (cappedPlanId) {
      logger.info(
        { userId: input.userId, cappedPlanId },
        'plan.lifecycle.create: attempt cap exceeded (existing capped plan)'
      );
      return {
        status: 'attempt_cap_exceeded',
        reason: `Existing plan ${cappedPlanId} has exhausted generation attempts. Please delete it or retry before creating a new plan.`,
        cappedPlanId,
      };
    }

    const normalizedTopic = input.topic.trim();

    // 7. Duplicate detection — return existing plan for idempotent submissions
    const existingPlanId =
      await this.ports.planPersistence.findRecentDuplicatePlan(
        input.userId,
        normalizedTopic
      );
    if (existingPlanId) {
      logger.info(
        { userId: input.userId, existingPlanId },
        'plan.lifecycle.create: duplicate detected'
      );
      return {
        status: 'duplicate_detected',
        existingPlanId,
      };
    }

    // 8. Atomic insert (checks plan limit + inserts within a single transaction)
    const insertResult = await this.ports.planPersistence.atomicInsertPlan(
      input.userId,
      {
        topic: normalizedTopic,
        skillLevel: input.skillLevel,
        weeklyHours: input.weeklyHours,
        learningStyle: input.learningStyle,
        visibility: 'private',
        origin: 'ai',
        startDate: duration.startDate,
        deadlineDate: duration.deadlineDate,
      }
    );

    if (!insertResult.success) {
      logger.info(
        { userId: input.userId },
        'plan.lifecycle.create: quota rejected (plan limit)'
      );
      return {
        status: 'quota_rejected',
        reason: insertResult.reason,
      };
    }

    logger.info(
      { userId: input.userId, planId: insertResult.id, tier, origin: 'ai' },
      'plan.lifecycle.create: plan created'
    );
    return {
      status: 'success',
      planId: insertResult.id,
      tier,
      normalizedInput: {
        topic: normalizedTopic,
        skillLevel: input.skillLevel,
        weeklyHours: input.weeklyHours,
        learningStyle: input.learningStyle,
        startDate: duration.startDate,
        deadlineDate: duration.deadlineDate,
      },
    };
  }

  /**
   * Create a new PDF-origin learning plan.
   *
   * Flow: validate → resolve tier → check requested duration cap → normalize duration
   *       → check normalized duration cap → check attempt cap → prepare PDF input (quota + proof) → atomic insert
   *
   * Rollback guarantee: if any step after PDF quota reservation fails,
   * the reserved quota is automatically rolled back via PdfOriginPort.
   *
   * @returns A discriminated union result — never throws for lifecycle outcomes.
   */
  async createPdfPlan(input: CreatePdfPlanInput): Promise<CreatePlanResult> {
    // 1. Validate PDF-specific fields
    if (
      !input.extractedContent ||
      !input.pdfProofToken ||
      !input.pdfExtractionHash
    ) {
      logger.warn(
        { userId: input.userId },
        'plan.lifecycle.create_pdf: validation failed'
      );
      return {
        status: 'permanent_failure',
        classification: 'validation',
        error: new Error(
          'PDF extraction proof fields are required for PDF-origin plans.'
        ),
      };
    }

    // 2. Resolve tier
    const tier = await this.ports.quota.resolveUserTier(input.userId);

    // 3. Reject raw requested range before tier normalization
    const requestedWeeksPdf = calculateTotalWeeks({
      startDate: input.startDate ?? null,
      deadlineDate: input.deadlineDate ?? null,
    });
    const requestedCapPdf = this.ports.quota.checkDurationCap({
      tier,
      weeklyHours: input.weeklyHours,
      totalWeeks: requestedWeeksPdf,
    });
    if (!requestedCapPdf.allowed) {
      logger.info(
        { userId: input.userId, tier },
        'plan.lifecycle.create_pdf: quota rejected (requested duration cap)'
      );
      return {
        status: 'quota_rejected',
        reason: requestedCapPdf.reason ?? 'Plan duration exceeds tier limits',
        upgradeUrl: requestedCapPdf.upgradeUrl,
      };
    }

    // 4. Normalize plan duration for the tier
    const duration = this.ports.quota.normalizePlanDuration({
      tier,
      weeklyHours: input.weeklyHours,
      startDate: input.startDate,
      deadlineDate: input.deadlineDate,
    });

    // 5. Check duration cap on normalized duration
    const durationCap = this.ports.quota.checkDurationCap({
      tier,
      weeklyHours: input.weeklyHours,
      totalWeeks: duration.totalWeeks,
    });

    if (!durationCap.allowed) {
      logger.info(
        { userId: input.userId, tier },
        'plan.lifecycle.create_pdf: quota rejected (normalized duration cap)'
      );
      return {
        status: 'quota_rejected',
        reason: durationCap.reason ?? 'Plan duration exceeds tier limits',
        upgradeUrl: durationCap.upgradeUrl,
      };
    }

    // 6. Check for capped plan (exhausted generation attempts)
    const cappedPlanId =
      await this.ports.planPersistence.findCappedPlanWithoutModules(
        input.userId
      );
    if (cappedPlanId) {
      logger.info(
        { userId: input.userId, cappedPlanId },
        'plan.lifecycle.create_pdf: attempt cap exceeded (existing capped plan)'
      );
      return {
        status: 'attempt_cap_exceeded',
        reason: `Existing plan ${cappedPlanId} has exhausted generation attempts. Please delete it or retry before creating a new plan.`,
        cappedPlanId,
      };
    }

    // 7. Reserve PDF quota + verify proof before duplicate detection so replayed
    // one-time tokens fail with invalid proof (403) instead of duplicate topic (409).
    const prepared = await this.ports.pdfOrigin.preparePlanInput({
      body: input.body,
      authUserId: input.authUserId,
      internalUserId: input.userId,
    });
    logger.info(
      { userId: input.userId },
      'plan.lifecycle.create_pdf: pdf quota reserved'
    );

    // 8. Duplicate detection — after proof so consumed tokens surface as invalid proof first
    const existingPlanId =
      await this.ports.planPersistence.findRecentDuplicatePlan(
        input.userId,
        prepared.topic.trim()
      );
    if (existingPlanId) {
      await this.ports.pdfOrigin.rollbackPdfUsage({
        internalUserId: input.userId,
        reserved: prepared.pdfUsageReserved,
      });
      logger.info(
        { userId: input.userId, existingPlanId },
        'plan.lifecycle.create_pdf: duplicate detected after proof'
      );
      return {
        status: 'duplicate_detected',
        existingPlanId,
      };
    }

    // 9. Atomic insert — rollback PDF quota on any failure after reservation
    let succeeded = false;
    try {
      const insertResult = await this.ports.planPersistence.atomicInsertPlan(
        input.userId,
        {
          topic: prepared.topic,
          skillLevel: prepared.skillLevel as CreatePdfPlanInput['skillLevel'],
          weeklyHours: prepared.weeklyHours,
          learningStyle:
            prepared.learningStyle as CreatePdfPlanInput['learningStyle'],
          visibility: 'private',
          origin: 'pdf',
          extractedContext: prepared.extractedContext as PdfContext | null,
          startDate: duration.startDate,
          deadlineDate: duration.deadlineDate,
        }
      );

      if (!insertResult.success) {
        logger.info(
          { userId: input.userId },
          'plan.lifecycle.create_pdf: quota rejected (plan limit), rolling back pdf quota'
        );
        return {
          status: 'quota_rejected',
          reason: insertResult.reason,
        };
      }

      succeeded = true;
      logger.info(
        { userId: input.userId, planId: insertResult.id, tier, origin: 'pdf' },
        'plan.lifecycle.create_pdf: plan created'
      );
      return {
        status: 'success',
        planId: insertResult.id,
        tier,
        normalizedInput: {
          topic: prepared.topic,
          skillLevel: input.skillLevel,
          weeklyHours: input.weeklyHours,
          learningStyle: input.learningStyle,
          startDate: duration.startDate,
          deadlineDate: duration.deadlineDate,
          pdfContext: prepared.extractedContext as PdfContext | null,
          pdfExtractionHash: prepared.pdfProvenance?.extractionHash,
          pdfProofVersion: prepared.pdfProvenance?.proofVersion,
        },
      };
    } finally {
      if (!succeeded) {
        logger.warn(
          { userId: input.userId },
          'plan.lifecycle.create_pdf: rolling back pdf quota after failure'
        );
        await this.ports.pdfOrigin.rollbackPdfUsage({
          internalUserId: input.userId,
          reserved: prepared.pdfUsageReserved,
        });
      }
    }
  }

  /**
   * Process a generation attempt for an existing plan.
   *
   * Flow: run generation → on success: mark ready + record usage
   *       → on retryable failure: mark failed (no usage)
   *       → on permanent failure: mark failed + record usage
   *
   * @returns A discriminated union result — never throws for lifecycle outcomes.
   */
  async processGenerationAttempt(
    input: ProcessGenerationInput
  ): Promise<GenerationAttemptResult> {
    logger.info(
      { planId: input.planId, userId: input.userId, tier: input.tier },
      'plan.lifecycle.generation: attempt started'
    );

    // 1. Run generation via port
    const generationResult = await this.ports.generation.runGeneration({
      planId: input.planId,
      userId: input.userId,
      tier: input.tier,
      input: input.input,
      modelOverride: input.modelOverride,
      signal: input.signal,
    });

    // 2. Handle success
    if (generationResult.status === 'success') {
      await this.ports.planPersistence.markGenerationSuccess(input.planId);

      await this.ports.usageRecording.recordUsage({
        userId: input.userId,
        usage: generationResult.usage,
        kind: 'plan',
      });

      logger.info(
        { planId: input.planId, durationMs: generationResult.durationMs },
        'plan.lifecycle.generation: success'
      );
      return {
        status: 'generation_success',
        data: {
          modules: generationResult.modules,
          metadata: generationResult.metadata,
          durationMs: generationResult.durationMs,
        },
      };
    }

    // 3. Handle failure — determine retryability
    const { classification, error } = generationResult;
    const retryable = isRetryableClassification(classification);

    // Always mark plan as failed
    await this.ports.planPersistence.markGenerationFailure(input.planId);

    if (retryable) {
      // Retryable failure — do NOT record usage (user will retry)
      logger.warn(
        { planId: input.planId, classification },
        'plan.lifecycle.generation: retryable failure'
      );
      return {
        status: 'retryable_failure',
        classification,
        error,
      };
    }

    // Permanent failure — record usage if available (attempt consumed)
    if (generationResult.usage) {
      await this.ports.usageRecording.recordUsage({
        userId: input.userId,
        usage: generationResult.usage,
        kind: 'plan',
      });
    }

    logger.warn(
      { planId: input.planId, classification },
      'plan.lifecycle.generation: permanent failure'
    );
    return {
      status: 'permanent_failure',
      classification,
      error,
    };
  }
}
