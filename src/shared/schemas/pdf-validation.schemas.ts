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

const pdfExtractedSectionSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    content: z.string().trim().max(5000),
    level: z.number().int().min(1).max(5),
    suggestedTopic: z.string().trim().max(200).optional(),
  })
  .strict();

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
