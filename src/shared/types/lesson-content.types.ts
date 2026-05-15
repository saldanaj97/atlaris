import {
  LessonCompletionCriteriaBlockSchema,
  LessonContentBlockSchema,
  LessonContentSchema,
  LessonExampleBlockSchema,
  LessonHeadingBlockSchema,
  LessonParagraphBlockSchema,
  LessonPracticeBlockSchema,
  LessonTakeawaysBlockSchema,
  ModuleLessonBatchProviderOutputSchema,
  ModuleLessonGenerationApiResponseSchema,
  ModuleLessonGenerationMetadataSchema,
} from '@/shared/schemas/lesson-content.schemas';
import type { z } from 'zod';

export type LessonHeadingBlock = z.infer<typeof LessonHeadingBlockSchema>;
export type LessonParagraphBlock = z.infer<typeof LessonParagraphBlockSchema>;
export type LessonExampleBlock = z.infer<typeof LessonExampleBlockSchema>;
export type LessonPracticeBlock = z.infer<typeof LessonPracticeBlockSchema>;
export type LessonTakeawaysBlock = z.infer<typeof LessonTakeawaysBlockSchema>;
export type LessonCompletionCriteriaBlock = z.infer<
  typeof LessonCompletionCriteriaBlockSchema
>;
export type LessonContentBlock = z.infer<typeof LessonContentBlockSchema>;
export type LessonContent = z.infer<typeof LessonContentSchema>;
export type ModuleLessonBatchProviderOutput = z.infer<
  typeof ModuleLessonBatchProviderOutputSchema
>;
export type ModuleLessonGenerationMetadata = z.infer<
  typeof ModuleLessonGenerationMetadataSchema
>;
export type ModuleLessonGenerationApiResponse = z.infer<
  typeof ModuleLessonGenerationApiResponseSchema
>;
