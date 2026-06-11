import {
  MAX_LESSON_BLOCK_TEXT_LENGTH,
  MAX_LESSON_BLOCK_TITLE_LENGTH,
  MAX_LESSON_BLOCKS_PER_TASK,
  MAX_LESSON_LIST_ITEM_LENGTH,
  MAX_LESSON_LIST_ITEMS,
  MAX_MODULE_LESSON_BATCH_TASKS,
} from '@supabase/schema/constants';
import { z } from 'zod';

const LessonHeadingBlockSchema = z
  .object({
    type: z.literal('heading'),
    text: z.string().max(MAX_LESSON_BLOCK_TEXT_LENGTH),
  })
  .strict();

const LessonParagraphBlockSchema = z
  .object({
    type: z.literal('paragraph'),
    text: z.string().max(MAX_LESSON_BLOCK_TEXT_LENGTH),
  })
  .strict();

const LessonExampleBlockSchema = z
  .object({
    type: z.literal('example'),
    title: z.string().max(MAX_LESSON_BLOCK_TITLE_LENGTH),
    text: z.string().max(MAX_LESSON_BLOCK_TEXT_LENGTH),
  })
  .strict();

const LessonPracticeBlockSchema = z
  .object({
    type: z.literal('practice'),
    text: z.string().max(MAX_LESSON_BLOCK_TEXT_LENGTH),
  })
  .strict();

const LessonTakeawaysBlockSchema = z
  .object({
    type: z.literal('takeaways'),
    items: z
      .array(z.string().max(MAX_LESSON_LIST_ITEM_LENGTH))
      .min(1)
      .max(MAX_LESSON_LIST_ITEMS),
  })
  .strict();

const LessonCompletionCriteriaBlockSchema = z
  .object({
    type: z.literal('completion_criteria'),
    items: z
      .array(z.string().max(MAX_LESSON_LIST_ITEM_LENGTH))
      .min(1)
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
    blocks: z
      .array(LessonContentBlockSchema)
      .min(1)
      .max(MAX_LESSON_BLOCKS_PER_TASK),
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
      .min(1)
      .max(MAX_MODULE_LESSON_BATCH_TASKS),
  })
  .strict();

export const ModuleLessonWorkflowMetadataSchema = z
  .object({
    provider: z.literal('workflow-sdk'),
    runId: z.string().min(1).max(256),
    startedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
  })
  .strict();

export const ModuleLessonGenerationMetadataSchema = z
  .object({
    version: z.literal(1),
    batchRequestId: z.string().max(128).optional(),
    workflow: ModuleLessonWorkflowMetadataSchema.optional(),
  })
  .strict();

const ModuleLessonGenerationApiBaseSchema = z
  .object({
    planId: z.string().uuid(),
    moduleId: z.string().uuid(),
  })
  .strict();

export const ModuleLessonGenerationApiResponseSchema = z.discriminatedUnion(
  'state',
  [
    ModuleLessonGenerationApiBaseSchema.extend({
      state: z.literal('ready'),
      durationMs: z.number().int().nonnegative().optional(),
    }),
    ModuleLessonGenerationApiBaseSchema.extend({
      state: z.literal('generating'),
    }),
    ModuleLessonGenerationApiBaseSchema.extend({
      state: z.literal('disabled'),
    }),
    ModuleLessonGenerationApiBaseSchema.extend({
      state: z.literal('provider_failure'),
      message: z.string().min(1),
    }),
    ModuleLessonGenerationApiBaseSchema.extend({
      state: z.literal('quota_denied'),
      currentCount: z.number().int().nonnegative(),
      limit: z.number().int().nonnegative(),
    }),
    ModuleLessonGenerationApiBaseSchema.extend({
      state: z.literal('not_found'),
    }),
    ModuleLessonGenerationApiBaseSchema.extend({
      state: z.literal('locked'),
    }),
  ],
);

export const ModuleLessonGenerationStatusResponseSchema =
  ModuleLessonGenerationApiBaseSchema.extend({
    status: z.enum(['not_generated', 'generating', 'ready', 'failed']),
  }).strict();
