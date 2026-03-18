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
import { pdfPreviewEditSchema } from '@/shared/schemas/pdf-validation.schemas';

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

export const topicSchema = z
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

export const createLearningPlanObject = z
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
