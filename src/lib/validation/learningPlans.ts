import { z } from 'zod';

import {
  LEARNING_STYLES,
  RESOURCE_TYPES,
  SKILL_LEVELS,
  type LearningStyle,
  type ResourceType,
  type SkillLevel,
} from '@/lib/types/db';

import { pdfPreviewEditSchema } from './pdf';
import {
  NOTES_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
  weeklyHoursSchema,
} from './shared';

export {
  NOTES_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
  weeklyHoursSchema,
} from './shared';

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

const SKILL_LEVEL_ENUM = z.enum(SKILL_LEVELS as [SkillLevel, ...SkillLevel[]]);
const LEARNING_STYLE_ENUM = z.enum(
  LEARNING_STYLES as [LearningStyle, ...LearningStyle[]]
);
const RESOURCE_TYPE_ENUM = z.enum(
  RESOURCE_TYPES as [ResourceType, ...ResourceType[]]
);

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

const pdfProofTokenSchema = z
  .string()
  .trim()
  .min(16, 'pdfProofToken is invalid.')
  .max(512, 'pdfProofToken is invalid.');

const pdfExtractionHashSchema = z
  .string()
  .trim()
  .regex(
    /^[a-f0-9]{64}$/i,
    'pdfExtractionHash must be a 64-character SHA-256 hex digest.'
  )
  .transform((value) => value.toLowerCase());

const pdfProofVersionSchema = z.literal(1);

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

export type PlanRegenerationOverridesInput = z.infer<
  typeof planRegenerationOverridesSchema
>;

export const planRegenerationRequestSchema = z
  .object({
    overrides: planRegenerationOverridesSchema.optional(),
  })
  .strict();

export type PlanRegenerationRequestInput = z.infer<
  typeof planRegenerationRequestSchema
>;

const createLearningPlanObject = z
  .object({
    topic: topicSchema.optional(),
    skillLevel: SKILL_LEVEL_ENUM,
    weeklyHours: weeklyHoursSchema,
    learningStyle: LEARNING_STYLE_ENUM,
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
    visibility: z.literal('private').optional().default('private'),
    origin: z.enum(['ai', 'manual', 'template', 'pdf'] as const).default('ai'),
    extractedContent: pdfPreviewEditSchema.optional(),
    pdfProofToken: pdfProofTokenSchema.optional(),
    pdfExtractionHash: pdfExtractionHashSchema.optional(),
    pdfProofVersion: pdfProofVersionSchema.optional(),
  })
  .strict();

export const createLearningPlanSchema = createLearningPlanObject
  .superRefine((data, ctx) => {
    if (data.origin === 'pdf' && !data.extractedContent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['extractedContent'],
        message: 'extractedContent is required for PDF-based plans.',
      });
    }

    if (data.origin === 'pdf' && !data.pdfProofToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pdfProofToken'],
        message: 'pdfProofToken is required for PDF-based plans.',
      });
    }

    if (data.origin === 'pdf' && !data.pdfExtractionHash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pdfExtractionHash'],
        message: 'pdfExtractionHash is required for PDF-based plans.',
      });
    }

    if (data.origin === 'pdf' && data.pdfProofVersion !== undefined) {
      if (data.pdfProofVersion !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pdfProofVersion'],
          message: 'pdfProofVersion is invalid.',
        });
      }
    }

    if (data.origin !== 'pdf' && (!data.topic || data.topic.length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['topic'],
        message: 'Topic is required for non-PDF plans (at least 3 characters).',
      });
    }

    if (data.origin !== 'pdf' && data.extractedContent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['extractedContent'],
        message: 'extractedContent is only allowed for PDF-based plans.',
      });
    }

    if (data.origin !== 'pdf' && data.pdfProofToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pdfProofToken'],
        message: 'pdfProofToken is only allowed for PDF-based plans.',
      });
    }

    if (data.origin !== 'pdf' && data.pdfExtractionHash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pdfExtractionHash'],
        message: 'pdfExtractionHash is only allowed for PDF-based plans.',
      });
    }

    if (data.origin !== 'pdf' && data.pdfProofVersion !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pdfProofVersion'],
        message: 'pdfProofVersion is only allowed for PDF-based plans.',
      });
    }
  })
  .transform((data) => {
    const topic =
      data.topic ??
      (data.origin === 'pdf' && data.extractedContent
        ? data.extractedContent.mainTopic
        : undefined);
    return { ...data, topic: topic ?? '' };
  });

export type CreateLearningPlanInput = z.infer<typeof createLearningPlanSchema>;

export const learningPlanResourceSchema = z.object({
  id: z.string().uuid(),
  type: RESOURCE_TYPE_ENUM,
  title: z.string(),
  url: z.string().url(),
  durationMinutes: z.number().int().nonnegative().optional(),
});

export const onboardingFormSchema = z
  .object({
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
