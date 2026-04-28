import {
  getCreateLogBase,
  insertCreatedPlan,
} from '@/features/plans/lifecycle/creation-pipeline';
import type { PlanCreationStrategyPorts } from '@/features/plans/lifecycle/origin-strategies/types';
import type {
  CreateAiPlanInput,
  CreatePlanResult,
  SubscriptionTier,
} from '@/features/plans/lifecycle/types';
import { logger } from '@/lib/logging/logger';

export async function createAiPlanWithStrategy(
  ports: PlanCreationStrategyPorts,
  params: {
    input: CreateAiPlanInput;
    tier: SubscriptionTier;
    duration: {
      startDate: string | null;
      deadlineDate: string | null;
    };
  },
): Promise<CreatePlanResult> {
  const { input, tier, duration } = params;

  if (!input.topic || input.topic.trim().length < 3) {
    logger.warn(
      { userId: input.userId },
      `${getCreateLogBase('create')}: validation failed`,
    );
    return {
      status: 'permanent_failure',
      classification: 'validation',
      error: new Error(
        'Topic is required and must be at least 3 characters for AI-origin plans.',
      ),
    };
  }

  const normalizedTopic = input.topic.trim();
  const existingPlanId = await ports.planPersistence.findRecentDuplicatePlan(
    input.userId,
    normalizedTopic,
  );
  if (existingPlanId) {
    logger.info(
      { userId: input.userId, existingPlanId },
      `${getCreateLogBase('create')}: duplicate detected`,
    );
    return {
      status: 'duplicate_detected',
      existingPlanId,
    };
  }

  return insertCreatedPlan({
    planPersistence: ports.planPersistence,
    userId: input.userId,
    tier,
    lifecycleLabel: 'create',
    planData: {
      topic: normalizedTopic,
      skillLevel: input.skillLevel,
      weeklyHours: input.weeklyHours,
      learningStyle: input.learningStyle,
      visibility: 'private',
      origin: 'ai',
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
    },
  });
}
