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

import { pdfPreviewEditSchema } from '@/features/pdf/validation/pdf';
import {
  LEARNING_STYLE_ENUM,
  NOTES_MAX_LENGTH,
  SKILL_LEVEL_ENUM,
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

export const planRegenerationRequestSchema = z
  .object({
    overrides: planRegenerationOverridesSchema.optional(),
  })
  .strict();

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
