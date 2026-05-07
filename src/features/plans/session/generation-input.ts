import { buildPlanGenerationInputFields } from '@/features/plans/generation-input';
import { toPlanCalendarDate } from '@/features/plans/calendar-date';

import type { ProcessGenerationInput } from '@/features/plans/lifecycle/types';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import type { PlanGenerationCoreFieldsNormalized } from '@/shared/types/ai-provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

type SuccessfulCreatePlanGenerationResult = {
  planId: string;
  tier: SubscriptionTier;
  normalizedInput: Readonly<PlanGenerationCoreFieldsNormalized>;
};

export type RetryPlanGenerationInputSource =
  Readonly<PlanGenerationCoreFieldsNormalized>;

export type RetryGenerationInput = Pick<
  CreateLearningPlanInput,
  | 'topic'
  | 'skillLevel'
  | 'weeklyHours'
  | 'learningStyle'
  | 'startDate'
  | 'deadlineDate'
>;

export function buildCreateGenerationInput({
  body,
  createResult,
  userId,
  modelOverride,
}: {
  body: CreateLearningPlanInput;
  createResult: SuccessfulCreatePlanGenerationResult;
  userId: string;
  modelOverride?: string;
}): ProcessGenerationInput {
  const { normalizedInput: ni, planId, tier } = createResult;

  return {
    planId,
    userId,
    tier,
    input: buildPlanGenerationInputFields({
      topic: ni.topic,
      notes: body.notes,
      skillLevel: body.skillLevel,
      weeklyHours: body.weeklyHours,
      learningStyle: body.learningStyle,
      startDate: ni.startDate,
      deadlineDate: ni.deadlineDate,
    }),
    modelOverride,
  };
}

export function buildRetryGenerationInput(
  plan: RetryPlanGenerationInputSource,
  onInvalidDate?: (params: {
    field: 'startDate' | 'deadlineDate';
    value: string;
  }) => void,
): RetryGenerationInput {
  return {
    topic: plan.topic,
    skillLevel: plan.skillLevel,
    weeklyHours: plan.weeklyHours,
    learningStyle: plan.learningStyle,
    startDate: toRetryDate(plan.startDate, 'startDate', onInvalidDate),
    deadlineDate: toRetryDate(plan.deadlineDate, 'deadlineDate', onInvalidDate),
  };
}

function toRetryDate(
  value: string | null,
  field: 'startDate' | 'deadlineDate',
  onInvalidDate:
    | ((params: { field: 'startDate' | 'deadlineDate'; value: string }) => void)
    | undefined,
): string | undefined {
  const date = toPlanCalendarDate(value);
  if (value && date === undefined) {
    onInvalidDate?.({ field, value });
  }
  return date;
}
