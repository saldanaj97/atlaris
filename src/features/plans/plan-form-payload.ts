import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';

import { createLearningPlanSchema } from '@/features/plans/validation/learningPlans';
import {
  deadlineWeeksToDate,
  formatDateToYmd,
} from '@/lib/date/format-local-ymd';
import { normalizeThrown } from '@/lib/errors';

export type PlanFormData = {
  topic: string;
  skillLevel: string;
  weeklyHours: string;
  learningStyle: string;
  deadlineWeeks: string;
};

const WEEKLY_HOURS: Record<string, number> = {
  '1-2': 2,
  '3-5': 5,
  '6-10': 10,
  '11-15': 15,
  '16-20': 20,
  '20+': 25,
};

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

export function buildCreatePlanPayloadFromForm(
  data: PlanFormData,
): PlanFormPayloadResult {
  try {
    return {
      ok: true,
      payload: createLearningPlanSchema.parse({
        topic: data.topic,
        skillLevel: data.skillLevel,
        weeklyHours: WEEKLY_HOURS[data.weeklyHours],
        learningStyle: data.learningStyle,
        notes: '',
        startDate: formatDateToYmd(new Date()),
        deadlineDate: deadlineWeeksToDate(data.deadlineWeeks),
        visibility: 'private',
        origin: 'ai',
      }),
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
