import {
  MAX_LESSON_BLOCK_TEXT_LENGTH,
  MAX_LESSON_BLOCK_TITLE_LENGTH,
  MAX_LESSON_BLOCKS_PER_TASK,
  MAX_LESSON_LIST_ITEM_LENGTH,
  MAX_LESSON_LIST_ITEMS,
  MAX_MODULE_LESSON_BATCH_TASKS,
} from '@supabase/schema/constants';
import { z } from 'zod';

const LessonHeadingBlockSchema = z.strictObject({
  type: z.literal('heading'),
  text: z.string().max(MAX_LESSON_BLOCK_TEXT_LENGTH),
});

const LessonParagraphBlockSchema = z.strictObject({
  type: z.literal('paragraph'),
  text: z.string().max(MAX_LESSON_BLOCK_TEXT_LENGTH),
});

const LessonExampleBlockSchema = z.strictObject({
  type: z.literal('example'),
  title: z.string().max(MAX_LESSON_BLOCK_TITLE_LENGTH),
  text: z.string().max(MAX_LESSON_BLOCK_TEXT_LENGTH),
});

const LessonPracticeBlockSchema = z.strictObject({
  type: z.literal('practice'),
  text: z.string().max(MAX_LESSON_BLOCK_TEXT_LENGTH),
});

const LessonTakeawaysBlockSchema = z.strictObject({
  type: z.literal('takeaways'),
  items: z
    .array(z.string().max(MAX_LESSON_LIST_ITEM_LENGTH))
    .min(1)
    .max(MAX_LESSON_LIST_ITEMS),
});

const LessonCompletionCriteriaBlockSchema = z.strictObject({
  type: z.literal('completion_criteria'),
  items: z
    .array(z.string().max(MAX_LESSON_LIST_ITEM_LENGTH))
    .min(1)
    .max(MAX_LESSON_LIST_ITEMS),
});

export const LessonContentBlockSchema = z.discriminatedUnion('type', [
  LessonHeadingBlockSchema,
  LessonParagraphBlockSchema,
  LessonExampleBlockSchema,
  LessonPracticeBlockSchema,
  LessonTakeawaysBlockSchema,
  LessonCompletionCriteriaBlockSchema,
]);

export const LessonContentSchema = z.strictObject({
  version: z.literal(1),
  blocks: z
    .array(LessonContentBlockSchema)
    .min(1)
    .max(MAX_LESSON_BLOCKS_PER_TASK),
});

export const ModuleLessonBatchProviderOutputSchema = z.strictObject({
  version: z.literal(1),
  tasks: z
    .array(
      z.strictObject({
        taskId: z.uuid(),
        content: LessonContentSchema,
      }),
    )
    .min(1)
    .max(MAX_MODULE_LESSON_BATCH_TASKS),
});

const ModuleLessonWorkflowMetadataSchema = z.strictObject({
  provider: z.literal('workflow-sdk'),
  runId: z.string().min(1).max(256),
  startedAt: z.iso.datetime().optional(),
  completedAt: z.iso.datetime().optional(),
});

export const ModuleLessonGenerationMetadataSchema = z.strictObject({
  version: z.literal(1),
  batchRequestId: z.string().max(128).optional(),
  workflow: ModuleLessonWorkflowMetadataSchema.optional(),
});

const ModuleLessonGenerationApiBaseSchema = z.strictObject({
  planId: z.uuid(),
  moduleId: z.uuid(),
});

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
  });
