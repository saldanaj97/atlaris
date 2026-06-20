import type { z } from 'zod';

import {
  LessonContentBlockSchema,
  LessonContentSchema,
  ModuleLessonBatchProviderOutputSchema,
  ModuleLessonGenerationApiResponseSchema,
  ModuleLessonGenerationMetadataSchema,
} from '@/shared/schemas/lesson-content.schemas';

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
