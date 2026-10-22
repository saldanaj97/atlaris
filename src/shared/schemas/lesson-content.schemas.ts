import {
  CloudflareWorkflowRunMetadataSchema,
  WorkflowSdkMetadataSchema,
} from '@/shared/schemas/workflow-metadata.schemas';
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

/** Research source keys (`S1`, `S2`, …) a lesson may cite, at most this many. */
export const MAX_LESSON_SOURCE_IDS = 32;

export const LessonSourceIdSchema = z.string().regex(/^S[1-9]\d*$/);

export const LessonContentSchema = z.strictObject({
  version: z.literal(1),
  blocks: z
    .array(LessonContentBlockSchema)
    .min(1)
    .max(MAX_LESSON_BLOCKS_PER_TASK),
  /**
   * Research source keys the body cites as `[S1]`, unique and in order of
   * first appearance. Set by code on grounded lessons (JCS-160); absent on
   * batch lessons and rows written before it.
   */
  sourceIds: z
    .array(LessonSourceIdSchema)
    .max(MAX_LESSON_SOURCE_IDS)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'sourceIds must be unique',
    })
    .optional(),
});

export const ModuleLessonBatchProviderOutputSchema = z.strictObject({
  version: z.literal(1),
  tasks: z
    .array(
      z.strictObject({
        // Any string: the parser maps lessons to tasks by position and
        // repairs echoed ids the model garbled.
        taskId: z.string(),
        content: LessonContentSchema,
      }),
    )
    .min(1)
    .max(MAX_MODULE_LESSON_BATCH_TASKS),
});

export const ModuleLessonGenerationMetadataSchema = z.strictObject({
  version: z.literal(1),
  batchRequestId: z.string().max(128).optional(),
  /** Which runtime owns the run. `workflow-sdk` remains only for historical rows. */
  workflow: z
    .discriminatedUnion('provider', [
      WorkflowSdkMetadataSchema,
      CloudflareWorkflowRunMetadataSchema,
    ])
    .optional(),
  providerStartedAt: z.iso.datetime().optional(),
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
      workflowRunId: z.string().min(1).optional(),
    }),
    ModuleLessonGenerationApiBaseSchema.extend({
      state: z.literal('disabled'),
    }),
    ModuleLessonGenerationApiBaseSchema.extend({
      state: z.literal('provider_failure'),
      message: z.string().min(1),
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
    workflowRunId: z.string().min(1).optional(),
    /** Lesson repair steps the plan's AI spend ceiling cut (JCS-170). */
    budgetCuts: z.number().int().nonnegative().optional(),
  });
