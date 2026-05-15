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
  ModuleLessonGenerationMetadataSchema,
} from '@/shared/schemas/lesson-content.schemas';

export type LessonHeadingBlock = import('zod').infer<
  typeof LessonHeadingBlockSchema
>;
export type LessonParagraphBlock = import('zod').infer<
  typeof LessonParagraphBlockSchema
>;
export type LessonExampleBlock = import('zod').infer<
  typeof LessonExampleBlockSchema
>;
export type LessonPracticeBlock = import('zod').infer<
  typeof LessonPracticeBlockSchema
>;
export type LessonTakeawaysBlock = import('zod').infer<
  typeof LessonTakeawaysBlockSchema
>;
export type LessonCompletionCriteriaBlock = import('zod').infer<
  typeof LessonCompletionCriteriaBlockSchema
>;
export type LessonContentBlock = import('zod').infer<
  typeof LessonContentBlockSchema
>;
export type LessonContent = import('zod').infer<typeof LessonContentSchema>;
export type ModuleLessonBatchProviderOutput = import('zod').infer<
  typeof ModuleLessonBatchProviderOutputSchema
>;
export type ModuleLessonGenerationMetadata = import('zod').infer<
  typeof ModuleLessonGenerationMetadataSchema
>;
