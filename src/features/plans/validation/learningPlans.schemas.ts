import { toPlanCalendarDate } from '@/features/plans/calendar-date';
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
