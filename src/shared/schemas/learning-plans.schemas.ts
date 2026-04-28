import { z } from 'zod';

import {
  NOTES_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
} from '@/shared/constants/learning-plans';
import {
  LEARNING_STYLE_ENUM,
  SKILL_LEVEL_ENUM,
  weeklyHoursSchema,
} from '@/shared/schemas/plan-validation.schemas';

function enforceMaxLength(
  value: string,
  maxLength: number,
  ctx: z.RefinementCtx,
  field: 'topic' | 'notes',
) {
  if (value.length > maxLength) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${field} must be ${maxLength} characters or fewer.`,
      params: { maxLength, actualLength: value.length },
    });
  }
}

export const topicSchema = z
  .string()
  .trim()
  .min(3, 'Topic must be at least 3 characters.')
  .superRefine((value, ctx) =>
    enforceMaxLength(value, TOPIC_MAX_LENGTH, ctx, 'topic'),
  );

const notesSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) =>
    enforceMaxLength(value, NOTES_MAX_LENGTH, ctx, 'notes'),
  );

export const createLearningPlanNotesSchema = notesSchema
  .optional()
  .nullable()
  .transform((value) => (value ? value : undefined));

export const createLearningPlanSchema = z
  .object({
    topic: topicSchema,
    skillLevel: SKILL_LEVEL_ENUM,
    weeklyHours: weeklyHoursSchema,
    learningStyle: LEARNING_STYLE_ENUM,
    notes: createLearningPlanNotesSchema,
    startDate: z
      .string()
      .trim()
      .optional()
      .nullable()
      .refine(
        (value) => !value || !Number.isNaN(Date.parse(value)),
        'Start date must be a valid ISO date string.',
      )
      .transform((value) => (value ? value : undefined)),
    deadlineDate: z
      .string()
      .trim()
      .optional()
      .nullable()
      .refine(
        (value) => !value || !Number.isNaN(Date.parse(value)),
        'Deadline date must be a valid ISO date string.',
      )
      .transform((value) => (value ? value : undefined)),
    visibility: z.literal('private').optional().default('private'),
    origin: z.enum(['ai', 'manual', 'template'] as const).default('ai'),
  })
  .strict();
