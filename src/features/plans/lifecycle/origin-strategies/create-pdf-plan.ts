import {
  getCreateLogBase,
  insertCreatedPlan,
} from '@/features/plans/lifecycle/creation-pipeline';
import type { PdfPlanCreationStrategyPorts } from '@/features/plans/lifecycle/origin-strategies/types';
import type {
  CreatePdfPlanInput,
  CreatePlanResult,
  SubscriptionTier,
} from '@/features/plans/lifecycle/types';
import { logger } from '@/lib/logging/logger';

async function rollbackPdfUsageSafely(params: {
  ports: PdfPlanCreationStrategyPorts;
  userId: string;
  reserved: boolean;
}): Promise<void> {
  try {
    await params.ports.pdfOrigin.rollbackPdfUsage({
      internalUserId: params.userId,
      reserved: params.reserved,
    });
  } catch (rollbackError) {
    logger.error(
      {
        userId: params.userId,
        rollbackError,
      },
      `${getCreateLogBase('create_pdf')}: failed to rollback pdf quota`
    );
  }
}

export async function createPdfPlanWithStrategy(
  ports: PdfPlanCreationStrategyPorts,
  params: {
    input: CreatePdfPlanInput;
    tier: SubscriptionTier;
    duration: {
      startDate: string | null;
      deadlineDate: string | null;
    };
  }
): Promise<CreatePlanResult> {
  const { input, tier, duration } = params;

  if (
    !input.extractedContent ||
    !input.pdfProofToken ||
    !input.pdfExtractionHash
  ) {
    logger.warn(
      { userId: input.userId },
      `${getCreateLogBase('create_pdf')}: validation failed`
    );
    return {
      status: 'permanent_failure',
      classification: 'validation',
      error: new Error(
        'PDF extraction proof fields are required for PDF-origin plans.'
      ),
    };
  }

  const prepared = await ports.pdfOrigin.preparePlanInput({
    authUserId: input.authUserId,
    internalUserId: input.userId,
    topic: input.topic,
    skillLevel: input.skillLevel,
    weeklyHours: input.weeklyHours,
    learningStyle: input.learningStyle,
    extractedContent: input.extractedContent,
    pdfProofToken: input.pdfProofToken,
    pdfExtractionHash: input.pdfExtractionHash,
    pdfProofVersion: input.pdfProofVersion,
  });
  logger.info(
    { userId: input.userId },
    `${getCreateLogBase('create_pdf')}: pdf quota reserved`
  );

  const normalizedTopic = prepared.topic.trim();
  const existingPlanId = await ports.planPersistence.findRecentDuplicatePlan(
    input.userId,
    normalizedTopic
  );
  if (existingPlanId) {
    await rollbackPdfUsageSafely({
      ports,
      userId: input.userId,
      reserved: prepared.pdfUsageReserved,
    });
    logger.info(
      { userId: input.userId, existingPlanId },
      `${getCreateLogBase('create_pdf')}: duplicate detected after proof`
    );
    return {
      status: 'duplicate_detected',
      existingPlanId,
    };
  }

  let succeeded = false;
  try {
    const result = await insertCreatedPlan({
      planPersistence: ports.planPersistence,
      userId: input.userId,
      tier,
      lifecycleLabel: 'create_pdf',
      planData: {
        topic: normalizedTopic,
        skillLevel: prepared.skillLevel,
        weeklyHours: prepared.weeklyHours,
        learningStyle: prepared.learningStyle,
        visibility: 'private',
        origin: 'pdf',
        extractedContext: prepared.extractedContext,
        startDate: duration.startDate,
        deadlineDate: duration.deadlineDate,
      },
      normalizedInput: {
        topic: normalizedTopic,
        skillLevel: input.skillLevel,
        weeklyHours: input.weeklyHours,
        learningStyle: input.learningStyle,
        startDate: duration.startDate,
        deadlineDate: duration.deadlineDate,
        pdfContext: prepared.extractedContext,
        pdfExtractionHash: prepared.pdfProvenance?.extractionHash,
        pdfProofVersion: prepared.pdfProvenance?.proofVersion,
      },
    });

    succeeded = result.status === 'success';
    return result;
  } finally {
    if (!succeeded) {
      logger.warn(
        { userId: input.userId },
        `${getCreateLogBase('create_pdf')}: rolling back pdf quota after failure`
      );
      await rollbackPdfUsageSafely({
        ports,
        userId: input.userId,
        reserved: prepared.pdfUsageReserved,
      });
    }
  }
}
