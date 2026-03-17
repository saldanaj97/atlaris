/**
 * PlanLifecycleService — orchestrates plan creation through port interfaces.
 *
 * This service has ZERO direct imports from billing, AI, DB, or job modules.
 * All interaction with external concerns goes through injected ports.
 *
 * Returns discriminated union results for expected lifecycle outcomes.
 * Only unexpected errors (bugs) propagate as thrown exceptions.
 */

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
   * Flow: validate → resolve tier → normalize duration → check duration cap
   *       → check attempt cap → prepare input → atomic insert
   *
   * @returns A discriminated union result — never throws for lifecycle outcomes.
   */
  async createPlan(input: CreateAiPlanInput): Promise<CreatePlanResult> {
    // 1. Validate input
    if (!input.topic || input.topic.trim().length < 3) {
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

    // 3. Normalize plan duration for the tier
    const duration = this.ports.quota.normalizePlanDuration({
      tier,
      weeklyHours: input.weeklyHours,
      startDate: input.startDate,
      deadlineDate: input.deadlineDate,
    });

    // 4. Check duration cap
    const durationCap = this.ports.quota.checkDurationCap({
      tier,
      weeklyHours: input.weeklyHours,
      totalWeeks: duration.totalWeeks,
    });

    if (!durationCap.allowed) {
      return {
        status: 'quota_rejected',
        reason: durationCap.reason ?? 'Plan duration exceeds tier limits',
        upgradeUrl: durationCap.upgradeUrl,
      };
    }

    // 5. Check for capped plan (exhausted generation attempts)
    const cappedPlanId =
      await this.ports.planPersistence.findCappedPlanWithoutModules(
        input.userId
      );
    if (cappedPlanId) {
      return {
        status: 'quota_rejected',
        reason: `Existing plan ${cappedPlanId} has exhausted generation attempts. Please delete it or retry before creating a new plan.`,
      };
    }

    const normalizedTopic = input.topic.trim();

    // 6. Atomic insert (checks plan limit + inserts within a single transaction)
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
      return {
        status: 'quota_rejected',
        reason: insertResult.reason,
      };
    }

    return {
      status: 'success',
      planId: insertResult.id,
      tier,
      normalizedInput: {
        topic: normalizedTopic,
        startDate: duration.startDate,
        deadlineDate: duration.deadlineDate,
      },
    };
  }

  /**
   * Create a new PDF-origin learning plan.
   *
   * Flow: validate → resolve tier → normalize duration → check duration cap
   *       → check attempt cap → prepare PDF input (quota + proof) → atomic insert
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

    // 3. Normalize plan duration for the tier
    const duration = this.ports.quota.normalizePlanDuration({
      tier,
      weeklyHours: input.weeklyHours,
      startDate: input.startDate,
      deadlineDate: input.deadlineDate,
    });

    // 4. Check duration cap
    const durationCap = this.ports.quota.checkDurationCap({
      tier,
      weeklyHours: input.weeklyHours,
      totalWeeks: duration.totalWeeks,
    });

    if (!durationCap.allowed) {
      return {
        status: 'quota_rejected',
        reason: durationCap.reason ?? 'Plan duration exceeds tier limits',
        upgradeUrl: durationCap.upgradeUrl,
      };
    }

    // 5. Check for capped plan (exhausted generation attempts)
    const cappedPlanId =
      await this.ports.planPersistence.findCappedPlanWithoutModules(
        input.userId
      );
    if (cappedPlanId) {
      return {
        status: 'quota_rejected',
        reason: `Existing plan ${cappedPlanId} has exhausted generation attempts. Please delete it or retry before creating a new plan.`,
      };
    }

    // 6. Reserve PDF quota + verify proof via PdfOriginPort
    const prepared = await this.ports.pdfOrigin.preparePlanInput({
      body: input.body,
      authUserId: input.authUserId,
      internalUserId: input.userId,
    });

    // 7. Atomic insert — rollback PDF quota on any failure after reservation
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
        return {
          status: 'quota_rejected',
          reason: insertResult.reason,
        };
      }

      succeeded = true;
      return {
        status: 'success',
        planId: insertResult.id,
        tier,
        normalizedInput: {
          topic: prepared.topic,
          startDate: duration.startDate,
          deadlineDate: duration.deadlineDate,
          pdfContext: prepared.extractedContext,
          pdfExtractionHash: prepared.pdfProvenance?.extractionHash,
          pdfProofVersion: prepared.pdfProvenance?.proofVersion,
        },
      };
    } finally {
      if (!succeeded) {
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

      // Extract usage from metadata for recording
      const metadata = generationResult.metadata;
      await this.ports.usageRecording.recordUsage({
        userId: input.userId,
        provider: (metadata.provider as string) ?? 'unknown',
        model: (metadata.model as string) ?? 'unknown',
        inputTokens: (metadata.usage as Record<string, unknown>)
          ?.inputTokens as number | undefined,
        outputTokens: (metadata.usage as Record<string, unknown>)
          ?.outputTokens as number | undefined,
        costCents: (metadata.usage as Record<string, unknown>)?.costCents as
          | number
          | undefined,
        kind: 'plan',
      });

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
      return {
        status: 'retryable_failure',
        classification,
        error,
      };
    }

    // Permanent failure — record usage (attempt consumed)
    const metadata = generationResult.metadata as
      | Record<string, unknown>
      | undefined;
    await this.ports.usageRecording.recordUsage({
      userId: input.userId,
      provider: (metadata?.provider as string) ?? 'unknown',
      model: (metadata?.model as string) ?? 'unknown',
      inputTokens: (metadata?.usage as Record<string, unknown>)?.inputTokens as
        | number
        | undefined,
      outputTokens: (metadata?.usage as Record<string, unknown>)
        ?.outputTokens as number | undefined,
      costCents: (metadata?.usage as Record<string, unknown>)?.costCents as
        | number
        | undefined,
      kind: 'plan',
    });

    return {
      status: 'permanent_failure',
      classification,
      error,
    };
  }
}
