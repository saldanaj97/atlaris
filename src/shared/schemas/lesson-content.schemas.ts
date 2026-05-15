import { z } from 'zod';

import {
  MAX_LESSON_BLOCK_TEXT_LENGTH,
  MAX_LESSON_BLOCK_TITLE_LENGTH,
  MAX_LESSON_BLOCKS_PER_TASK,
  MAX_LESSON_LIST_ITEM_LENGTH,
  MAX_LESSON_LIST_ITEMS,
  MAX_MODULE_LESSON_BATCH_TASKS,
} from '@supabase/schema/constants';

export const LessonHeadingBlockSchema = z
  .object({
    type: z.literal('heading'),
    text: z.string().max(MAX_LESSON_BLOCK_TEXT_LENGTH),
  })
  .strict();

export const LessonParagraphBlockSchema = z
  .object({
    type: z.literal('paragraph'),
    text: z.string().max(MAX_LESSON_BLOCK_TEXT_LENGTH),
  })
  .strict();

export const LessonExampleBlockSchema = z
  .object({
    type: z.literal('example'),
    title: z.string().max(MAX_LESSON_BLOCK_TITLE_LENGTH),
    text: z.string().max(MAX_LESSON_BLOCK_TEXT_LENGTH),
  })
  .strict();

export const LessonPracticeBlockSchema = z
  .object({
    type: z.literal('practice'),
    text: z.string().max(MAX_LESSON_BLOCK_TEXT_LENGTH),
  })
  .strict();

export const LessonTakeawaysBlockSchema = z
  .object({
    type: z.literal('takeaways'),
    items: z
      .array(z.string().max(MAX_LESSON_LIST_ITEM_LENGTH))
      .max(MAX_LESSON_LIST_ITEMS),
  })
  .strict();

export const LessonCompletionCriteriaBlockSchema = z
  .object({
    type: z.literal('completion_criteria'),
    items: z
      .array(z.string().max(MAX_LESSON_LIST_ITEM_LENGTH))
      .max(MAX_LESSON_LIST_ITEMS),
  })
  .strict();

export const LessonContentBlockSchema = z.discriminatedUnion('type', [
  LessonHeadingBlockSchema,
  LessonParagraphBlockSchema,
  LessonExampleBlockSchema,
  LessonPracticeBlockSchema,
  LessonTakeawaysBlockSchema,
  LessonCompletionCriteriaBlockSchema,
]);

export const LessonContentSchema = z
  .object({
    version: z.literal(1),
    blocks: z.array(LessonContentBlockSchema).max(MAX_LESSON_BLOCKS_PER_TASK),
  })
  .strict();

export const ModuleLessonBatchProviderOutputSchema = z
  .object({
    version: z.literal(1),
    tasks: z
      .array(
        z
          .object({
            taskId: z.string().uuid(),
            content: LessonContentSchema,
          })
          .strict(),
      )
      .max(MAX_MODULE_LESSON_BATCH_TASKS),
  })
  .strict();

export const ModuleLessonGenerationMetadataSchema = z
  .object({
    version: z.literal(1),
    batchRequestId: z.string().max(128).optional(),
  })
  .strict();
