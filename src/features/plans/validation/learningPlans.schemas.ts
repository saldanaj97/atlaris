import { toPlanCalendarDate } from '@/features/plans/calendar-date';
import {
  createLearningPlanNotesSchema,
  topicSchema,
} from '@/shared/schemas/learning-plans.schemas';
import {
  LEARNING_STYLE_ENUM,
  SKILL_LEVEL_ENUM,
  weeklyHoursSchema,
} from '@/shared/schemas/plan-validation.schemas';
import { z } from 'zod';

const planCalendarDateOverrideSchema = (field: 'Start' | 'Deadline') =>
  z
    .string()
    .trim()
    .refine(
      (value) => toPlanCalendarDate(value) === value,
      `${field} date must be a valid YYYY-MM-DD calendar date.`,
    )
    .transform((value) => (value ? value : null));

export const planRegenerationOverridesSchema = z
  .strictObject({
    skillLevel: SKILL_LEVEL_ENUM.optional(),
    weeklyHours: weeklyHoursSchema.optional(),
    learningStyle: LEARNING_STYLE_ENUM.optional(),
    startDate: planCalendarDateOverrideSchema('Start').optional().nullable(),
    deadlineDate: planCalendarDateOverrideSchema('Deadline')
      .optional()
      .nullable(),
    model: z.string().trim().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.startDate !== null &&
      data.startDate !== undefined &&
      data.deadlineDate !== null &&
      data.deadlineDate !== undefined &&
      data.startDate > data.deadlineDate
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startDate'],
        message: 'Start date must be on or before the deadline date.',
      });
    }
  });

export const onboardingFormObject = z.object({
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
  notes: createLearningPlanNotesSchema,
  startDate: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value),
      'Start date must be in YYYY-MM-DD format.',
    )
    .refine(
      (value) => !value || !Number.isNaN(Date.parse(value)),
      'Start date must be a valid date.',
    ),
  deadlineDate: z
    .string()
    .trim()
    .min(1, 'Please select a deadline date.')
    .refine(
      (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
      'Deadline date must be in YYYY-MM-DD format.',
    )
    .refine(
      (value) => !Number.isNaN(Date.parse(value)),
      'Deadline date must be a valid date.',
    ),
});
