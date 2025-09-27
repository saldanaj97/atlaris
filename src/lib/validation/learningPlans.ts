import { z } from 'zod';

import {
  LEARNING_STYLES,
  RESOURCE_TYPES,
  SKILL_LEVELS,
  type LearningStyle,
  type ResourceType,
  type SkillLevel,
} from '@/lib/types/db';

export const TOPIC_MAX_LENGTH = 200;
export const NOTES_MAX_LENGTH = 2000;

function enforceMaxLength(
  value: string,
  maxLength: number,
  ctx: z.RefinementCtx,
  field: 'topic' | 'notes'
) {
  if (value.length > maxLength) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${field} must be ${maxLength} characters or fewer.`,
      params: { maxLength, actualLength: value.length },
    });
  }
}

const skillLevelEnum = z.enum(SKILL_LEVELS as [SkillLevel, ...SkillLevel[]]);
const learningStyleEnum = z.enum(
  LEARNING_STYLES as [LearningStyle, ...LearningStyle[]]
);
const resourceTypeEnum = z.enum(
  RESOURCE_TYPES as [ResourceType, ...ResourceType[]]
);

export const weeklyHoursSchema = z
  .number()
  .refine(Number.isFinite, {
    message: 'Weekly hours must be provided as a number.',
  })
  .int('Weekly hours must be an integer.')
  .min(0, 'Weekly hours cannot be negative.')
  .max(80, 'Weekly hours cannot exceed 80.');

const topicSchema = z
  .string()
  .trim()
  .min(3, 'Topic must be at least 3 characters.')
  .superRefine((value, ctx) =>
    enforceMaxLength(value, TOPIC_MAX_LENGTH, ctx, 'topic')
  );

const notesSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) =>
    enforceMaxLength(value, NOTES_MAX_LENGTH, ctx, 'notes')
  );

export const createLearningPlanSchema = z.object({
  topic: topicSchema,
  skillLevel: skillLevelEnum,
  weeklyHours: weeklyHoursSchema,
  learningStyle: learningStyleEnum,
  notes: notesSchema
    .optional()
    .nullable()
    .transform((value) => (value ? value : undefined)),
  startDate: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine(
      (value) => !value || !Number.isNaN(Date.parse(value)),
      'Start date must be a valid ISO date string.'
    )
    .transform((value) => (value ? value : undefined)),
  deadlineDate: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine(
      (value) => !value || !Number.isNaN(Date.parse(value)),
      'Deadline date must be a valid ISO date string.'
    )
    .transform((value) => (value ? value : undefined)),
  visibility: z.enum(['private', 'public'] as const).default('private'),
  origin: z.enum(['ai', 'manual', 'template'] as const).default('ai'),
});

export type CreateLearningPlanInput = z.infer<typeof createLearningPlanSchema>;

export const learningPlanResourceSchema = z.object({
  id: z.string().uuid(),
  type: resourceTypeEnum,
  title: z.string(),
  url: z.string().url(),
  durationMinutes: z.number().int().nonnegative().optional(),
});

export const onboardingFormSchema = z.object({
  topic: createLearningPlanSchema.shape.topic,
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
  notes: createLearningPlanSchema.shape.notes,
});

export type OnboardingFormValues = z.infer<typeof onboardingFormSchema>;
