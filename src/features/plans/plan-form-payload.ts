import type { PlanFormData } from '@/features/plans/plan-form.types';
import type {
  CreateLearningPlanInput,
  OnboardingFormValues,
} from '@/features/plans/validation/learningPlans.types';

import { mapOnboardingToCreateInput } from '@/features/plans/create-mapper';
import {
  deadlineWeeksToDate,
  formatDateToYmd,
} from '@/lib/date/format-local-ymd';
import { normalizeThrown } from '@/lib/errors';

export type PlanFormPayloadResult =
  | { ok: true; payload: CreateLearningPlanInput }
  | { ok: false; error: PlanFormPayloadError };

export type PlanFormPayloadError = {
  message: string;
  name: string;
  stack?: string;
};

function normalizePlanFormPayloadError(error: unknown): PlanFormPayloadError {
  const normalized = normalizeThrown(error);

  if (normalized instanceof Error) {
    return {
      message: normalized.message,
      name: normalized.name,
      stack: normalized.stack,
    };
  }

  return {
    message: normalized.message,
    name: normalized.name ?? 'Error',
  };
}

function convertPlanFormToOnboardingValues(
  data: PlanFormData,
): OnboardingFormValues {
  return {
    topic: data.topic,
    skillLevel: data.skillLevel,
    weeklyHours: data.weeklyHours,
    learningStyle: data.learningStyle,
    notes: '',
    startDate: formatDateToYmd(new Date()),
    deadlineDate: deadlineWeeksToDate(data.deadlineWeeks),
  };
}

export function buildCreatePlanPayloadFromForm(
  data: PlanFormData,
): PlanFormPayloadResult {
  try {
    const onboardingValues = convertPlanFormToOnboardingValues(data);
    return {
      ok: true,
      payload: mapOnboardingToCreateInput(onboardingValues),
    };
  } catch (error) {
    return { ok: false, error: normalizePlanFormPayloadError(error) };
  }
}

/** User-safe message for form → API mapping failures (no stack traces). */
export function planFormPayloadErrorMessage(
  error: PlanFormPayloadError,
): string {
  const trimmed = error.message.trim();
  if (trimmed.length > 0 && trimmed.length <= 200) {
    return trimmed;
  }
  return 'Please double-check the form and try again.';
}
