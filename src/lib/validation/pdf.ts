import { z } from 'zod';

import {
  LEARNING_STYLES,
  SKILL_LEVELS,
  type LearningStyle,
  type SkillLevel,
} from '@/lib/types/db';

import {
  NOTES_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
  weeklyHoursSchema,
} from './shared';

const SKILL_LEVEL_ENUM = z.enum(SKILL_LEVELS as [SkillLevel, ...SkillLevel[]]);
const LEARNING_STYLE_ENUM = z.enum(
  LEARNING_STYLES as [LearningStyle, ...LearningStyle[]]
);

export const pdfExtractionRequestSchema = z
  .object({
    fileName: z.string().trim().min(1).max(200),
    fileType: z.string().trim().min(1).max(200),
    sizeBytes: z.number().int().positive(),
  })
  .strict();

export type PdfExtractionRequestInput = z.infer<
  typeof pdfExtractionRequestSchema
>;

export const pdfExtractedSectionSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    content: z.string().trim().max(5000),
    level: z.number().int().min(1).max(5),
    suggestedTopic: z.string().trim().max(200).optional(),
  })
  .strict();

export const pdfExtractedContentSchema = z
  .object({
    mainTopic: z.string().trim().min(3).max(TOPIC_MAX_LENGTH),
    sections: z.array(pdfExtractedSectionSchema).min(1).max(50),
    confidence: z.enum(['high', 'medium', 'low']),
  })
  .strict();

export type PdfExtractedContentInput = z.infer<
  typeof pdfExtractedContentSchema
>;

export const pdfPreviewEditSchema = z
  .object({
    mainTopic: z.string().trim().min(3).max(TOPIC_MAX_LENGTH),
    sections: z.array(pdfExtractedSectionSchema).min(1).max(50),
    skillLevel: SKILL_LEVEL_ENUM.optional(),
    weeklyHours: weeklyHoursSchema.optional(),
    learningStyle: LEARNING_STYLE_ENUM.optional(),
    notes: z.string().trim().max(NOTES_MAX_LENGTH).optional(),
  })
  .strict();

export type PdfPreviewEditInput = z.infer<typeof pdfPreviewEditSchema>;
