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

// Time constants in milliseconds
export const MILLISECONDS_PER_WEEK = 7 * 24 * 3600 * 1000;
export const DEFAULT_PLAN_DURATION_WEEKS = 2;
export const DEFAULT_PLAN_DURATION_MS =
  DEFAULT_PLAN_DURATION_WEEKS * MILLISECONDS_PER_WEEK;

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

const planNotesOverrideSchema = z
  .string()
  .trim()
  .max(
    NOTES_MAX_LENGTH,
    `notes must be ${NOTES_MAX_LENGTH} characters or fewer.`
  )
  .transform((value) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

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
    skillLevel: skillLevelEnum.optional(),
    weeklyHours: weeklyHoursSchema.optional(),
    learningStyle: learningStyleEnum.optional(),
    startDate: planStartDateOverrideSchema.optional().nullable(),
    deadlineDate: planDeadlineDateOverrideSchema.optional().nullable(),
  })
  .strict();

export type PlanRegenerationOverridesInput = z.infer<
  typeof planRegenerationOverridesSchema
>;

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

export const onboardingFormSchema = z
  .object({
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
  })
  .superRefine((data, ctx) => {
    const { startDate, deadlineDate } = data;

    // Only run cross-field validation if individual field validity checks would pass.
    const startIsProvided = Boolean(startDate);
    const startIsValid = startIsProvided
      ? !Number.isNaN(Date.parse(startDate as string))
      : false;
    const deadlineIsValid = !Number.isNaN(Date.parse(deadlineDate));

    // Normalize "today" to UTC date-only (midnight UTC) to avoid TZ edge cases.
    const todayUTC = new Date(new Date().toISOString().slice(0, 10));

    // Validate: deadlineDate must not be in the past (date-only comparison)
    if (deadlineIsValid) {
      const deadline = new Date(deadlineDate);
      if (deadline < todayUTC) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['deadlineDate'],
          message: 'Deadline date must not be in the past.',
        });
      }

      // Cap: deadline within 1 year of today
      const oneYearFromToday = new Date(todayUTC);
      oneYearFromToday.setUTCFullYear(oneYearFromToday.getUTCFullYear() + 1);
      if (deadline > oneYearFromToday) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['deadlineDate'],
          message: 'Deadline date must be within 1 year of today.',
        });
      }
    }

    // Validate: if startDate provided, it must be today or later
    if (startIsProvided && startIsValid) {
      const start = new Date(startDate as string);
      if (start < todayUTC) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['startDate'],
          message: 'Start date must not be in the past.',
        });
      }
    }

    // Validate: if startDate provided, it must be on or before deadlineDate
    if (startIsProvided && startIsValid && deadlineIsValid) {
      const start = new Date(startDate as string);
      const deadline = new Date(deadlineDate);
      if (start > deadline) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['startDate'],
          message: 'Start date must be on or before the deadline date.',
        });
      }
    }
  });

export type OnboardingFormValues = z.infer<typeof onboardingFormSchema>;
