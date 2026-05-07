import {
  addYears,
  isBefore,
  parseISO,
  startOfDay,
  startOfToday,
} from 'date-fns';
import { z } from 'zod';

export { createLearningPlanSchema } from '@/shared/schemas/learning-plans.schemas';
export { planRegenerationOverridesSchema } from './learningPlans.schemas';

import {
  onboardingFormObject,
  planRegenerationOverridesSchema,
} from './learningPlans.schemas';

export const MILLISECONDS_PER_WEEK = 7 * 24 * 3600 * 1000;
export const DEFAULT_PLAN_DURATION_WEEKS = 2;

export const planRegenerationRequestSchema = z
  .object({
    overrides: planRegenerationOverridesSchema.optional(),
  })
  .strict();

function toDateOnly(value: string): Date {
  const parsedDate = parseISO(value);

  if (!Number.isNaN(parsedDate.getTime())) {
    return startOfDay(parsedDate);
  }

  // Preserve existing rollover behavior for inputs that pass Date.parse(...)
  // but are not strict ISO calendar dates, such as 2025-02-30.
  return startOfDay(new Date(`${value}T12:00:00`));
}

type OnboardingDateFields = Pick<
  z.output<typeof onboardingFormObject>,
  'startDate' | 'deadlineDate'
>;

function validateOnboardingDateFields(
  data: OnboardingDateFields,
  ctx: z.RefinementCtx,
): void {
  const { startDate, deadlineDate } = data;
  const normalizedStartDate = startDate || undefined;

  // Only run cross-field validation if individual field validity checks would pass.
  const startIsProvided = Boolean(normalizedStartDate);
  const startIsValid = startIsProvided
    ? typeof normalizedStartDate === 'string' &&
      !Number.isNaN(Date.parse(normalizedStartDate))
    : false;
  const deadlineIsValid = !Number.isNaN(Date.parse(deadlineDate));
  const todayLocal = startOfToday();

  // Validate: deadlineDate must not be in the past (date-only comparison)
  if (deadlineIsValid) {
    const deadline = toDateOnly(deadlineDate);
    if (isBefore(deadline, todayLocal)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deadlineDate'],
        message: 'Deadline date must not be in the past.',
      });
    }

    // Cap: deadline within 1 year of today
    const oneYearFromToday = addYears(todayLocal, 1);
    if (deadline.getTime() > oneYearFromToday.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deadlineDate'],
        message: 'Deadline date must be within 1 year of today.',
      });
    }
  }

  // Validate: if startDate provided, it must be today or later
  if (normalizedStartDate && startIsValid) {
    const start = toDateOnly(normalizedStartDate);
    if (isBefore(start, todayLocal)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startDate'],
        message: 'Start date must not be in the past.',
      });
    }
  }

  // Validate: if startDate provided, it must be on or before deadlineDate
  if (normalizedStartDate && startIsValid && deadlineIsValid) {
    const start = toDateOnly(normalizedStartDate);
    const deadline = toDateOnly(deadlineDate);
    if (start.getTime() > deadline.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startDate'],
        message: 'Start date must be on or before the deadline date.',
      });
    }
  }
}

export const onboardingFormSchema = onboardingFormObject.superRefine(
  (data, ctx) => {
    validateOnboardingDateFields(data, ctx);
  },
);
