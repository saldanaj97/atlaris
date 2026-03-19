import {
  addYears,
  isBefore,
  parseISO,
  startOfDay,
  startOfToday,
} from 'date-fns';
import { z } from 'zod';

export type {
  CreateLearningPlanInput,
  OnboardingFormValues,
  PlanRegenerationOverridesInput,
} from './learningPlans.types';

import {
  LEARNING_STYLE_ENUM,
  NOTES_MAX_LENGTH,
  SKILL_LEVEL_ENUM,
  TOPIC_MAX_LENGTH,
  weeklyHoursSchema,
} from './shared';

export {
  createLearningPlanObject,
  createLearningPlanSchema,
} from '@/shared/schemas/learning-plans.schemas';
export {
  NOTES_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
  weeklyHoursSchema,
} from './shared';

import {
  createLearningPlanObject,
  topicSchema,
} from '@/shared/schemas/learning-plans.schemas';

// Time constants in milliseconds
export const MILLISECONDS_PER_WEEK = 7 * 24 * 3600 * 1000;
export const DEFAULT_PLAN_DURATION_WEEKS = 2;
export const DEFAULT_PLAN_DURATION_MS =
  DEFAULT_PLAN_DURATION_WEEKS * MILLISECONDS_PER_WEEK;

const planNotesOverrideSchema = z
  .string()
  .trim()
  .max(
    NOTES_MAX_LENGTH,
    `notes must be ${NOTES_MAX_LENGTH} characters or fewer.`
  )
  .transform((value) => (value.length > 0 ? value : null));

const planTopicOverrideSchema = z
  .string()
  .trim()
  .min(3, 'topic must be at least 3 characters long.')
  .max(
    TOPIC_MAX_LENGTH,
    `topic must be ${TOPIC_MAX_LENGTH} characters or fewer.`
  );

const planStartDateOverrideSchema = z
  .string()
  .trim()
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    'Start date must be a valid ISO date string.'
  )
  .transform((value) => (value ? value : null));

const planDeadlineDateOverrideSchema = z
  .string()
  .trim()
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    'Deadline date must be a valid ISO date string.'
  )
  .transform((value) => (value ? value : null));

export const planRegenerationOverridesSchema = z
  .object({
    topic: planTopicOverrideSchema.optional(),
    notes: planNotesOverrideSchema.optional().nullable(),
    skillLevel: SKILL_LEVEL_ENUM.optional(),
    weeklyHours: weeklyHoursSchema.optional(),
    learningStyle: LEARNING_STYLE_ENUM.optional(),
    startDate: planStartDateOverrideSchema.optional().nullable(),
    deadlineDate: planDeadlineDateOverrideSchema.optional().nullable(),
  })
  .strict();

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

const onboardingFormObject = z.object({
  topic: topicSchema,
  skillLevel: z
    .string()
    .trim()
    .min(1, 'Please choose a skill level.')
    .transform((value) => value.toLowerCase()),
  weeklyHours: z.union([
    weeklyHoursSchema,
    z.string().trim().min(1, 'Please select your weekly availability.'),
  ]),
  learningStyle: z.string().trim().min(1, 'Please choose a learning style.'),
  notes: createLearningPlanObject.shape.notes,
  startDate: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value),
      'Start date must be in YYYY-MM-DD format.'
    )
    .refine(
      (value) => !value || !Number.isNaN(Date.parse(value)),
      'Start date must be a valid date.'
    ),
  deadlineDate: z
    .string()
    .trim()
    .min(1, 'Please select a deadline date.')
    .refine(
      (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
      'Deadline date must be in YYYY-MM-DD format.'
    )
    .refine(
      (value) => !Number.isNaN(Date.parse(value)),
      'Deadline date must be a valid date.'
    ),
});

type OnboardingDateFields = Pick<
  z.output<typeof onboardingFormObject>,
  'startDate' | 'deadlineDate'
>;

export function validateOnboardingDateFields(
  data: OnboardingDateFields,
  ctx: z.RefinementCtx
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
  }
);
