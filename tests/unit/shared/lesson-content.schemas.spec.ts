import {
  LessonContentSchema,
  ModuleLessonBatchProviderOutputSchema,
  ModuleLessonGenerationApiResponseSchema,
  ModuleLessonGenerationMetadataSchema,
} from '@/shared/schemas/lesson-content.schemas';
import {
  MAX_LESSON_BLOCK_TEXT_LENGTH,
  MAX_LESSON_BLOCKS_PER_TASK,
  MAX_LESSON_LIST_ITEM_LENGTH,
  MAX_LESSON_LIST_ITEMS,
  MAX_MODULE_LESSON_BATCH_TASKS,
} from '@supabase/schema/constants';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const sampleBlock = { type: 'heading' as const, text: 'Intro' };

const sampleContent = {
  version: 1 as const,
  blocks: [
    sampleBlock,
    { type: 'paragraph' as const, text: 'Body.' },
    {
      type: 'example' as const,
      title: 'Ex',
      text: 'Example text.',
    },
    { type: 'practice' as const, text: 'Try this.' },
    { type: 'takeaways' as const, items: ['a', 'b'] },
    { type: 'completion_criteria' as const, items: ['c'] },
  ],
};

describe('lesson content Zod contracts', () => {
  it('accepts valid lesson content', () => {
    expect(() => LessonContentSchema.parse(sampleContent)).not.toThrow();
  });

  it('rejects unknown block type', () => {
    expect(() =>
      LessonContentSchema.parse({
        version: 1,
        blocks: [{ type: 'bogus', text: 'x' }],
      }),
    ).toThrow();
  });

  it('rejects extra top-level fields on lesson content', () => {
    expect(() =>
      LessonContentSchema.parse({ ...sampleContent, extra: true }),
    ).toThrow();
  });

  it('rejects extra fields on a block', () => {
    expect(() =>
      LessonContentSchema.parse({
        version: 1,
        blocks: [{ ...sampleBlock, foo: 1 }],
      }),
    ).toThrow();
  });

  it('rejects empty blocks array', () => {
    expect(() =>
      LessonContentSchema.parse({ version: 1, blocks: [] }),
    ).toThrow();
  });

  it('rejects paragraph text over cap', () => {
    expect(() =>
      LessonContentSchema.parse({
        version: 1,
        blocks: [
          {
            type: 'paragraph',
            text: 'x'.repeat(MAX_LESSON_BLOCK_TEXT_LENGTH + 1),
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects list item string over cap', () => {
    expect(() =>
      LessonContentSchema.parse({
        version: 1,
        blocks: [
          {
            type: 'takeaways',
            items: ['x'.repeat(MAX_LESSON_LIST_ITEM_LENGTH + 1)],
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects too many list items', () => {
    const items = Array.from({ length: MAX_LESSON_LIST_ITEMS + 1 }, () => 'ok');
    expect(() =>
      LessonContentSchema.parse({
        version: 1,
        blocks: [{ type: 'takeaways', items }],
      }),
    ).toThrow();
  });

  it('rejects too many blocks', () => {
    const blocks = Array.from(
      { length: MAX_LESSON_BLOCKS_PER_TASK + 1 },
      () => ({
        type: 'heading' as const,
        text: 'h',
      }),
    );
    expect(() => LessonContentSchema.parse({ version: 1, blocks })).toThrow();
  });

  it('accepts valid batch provider output', () => {
    const taskId = randomUUID();
    const parsed = ModuleLessonBatchProviderOutputSchema.parse({
      version: 1,
      tasks: [{ taskId, content: sampleContent }],
    });
    expect(parsed.tasks).toHaveLength(1);
  });

  it('rejects too many tasks in batch output', () => {
    const taskId = randomUUID();
    const tasks = Array.from(
      { length: MAX_MODULE_LESSON_BATCH_TASKS + 1 },
      () => ({
        taskId,
        content: { version: 1 as const, blocks: [sampleBlock] },
      }),
    );
    expect(() =>
      ModuleLessonBatchProviderOutputSchema.parse({ version: 1, tasks }),
    ).toThrow();
  });

  it('accepts metadata v1 and rejects extra keys', () => {
    expect(() =>
      ModuleLessonGenerationMetadataSchema.parse({ version: 1 }),
    ).not.toThrow();
    expect(() =>
      ModuleLessonGenerationMetadataSchema.parse({
        version: 1,
        batchRequestId: 'req-1',
      }),
    ).not.toThrow();
    expect(() =>
      ModuleLessonGenerationMetadataSchema.parse({ version: 1, x: 1 }),
    ).toThrow();
  });

  it('accepts module lesson generation API responses for every state variant', () => {
    const planId = randomUUID();
    const moduleId = randomUUID();
    expect(
      ModuleLessonGenerationApiResponseSchema.parse({
        state: 'ready',
        planId,
        moduleId,
        durationMs: 1,
      }),
    ).toMatchObject({ state: 'ready', planId, moduleId });

    expect(
      ModuleLessonGenerationApiResponseSchema.parse({
        state: 'generating',
        planId,
        moduleId,
      }),
    ).toMatchObject({ state: 'generating' });

    expect(
      ModuleLessonGenerationApiResponseSchema.parse({
        state: 'disabled',
        planId,
        moduleId,
      }),
    ).toMatchObject({ state: 'disabled' });

    expect(
      ModuleLessonGenerationApiResponseSchema.parse({
        state: 'provider_failure',
        planId,
        moduleId,
        message: 'x',
      }),
    ).toMatchObject({ state: 'provider_failure' });

    expect(
      ModuleLessonGenerationApiResponseSchema.parse({
        state: 'quota_denied',
        planId,
        moduleId,
        currentCount: 0,
        limit: 0,
      }),
    ).toMatchObject({ state: 'quota_denied' });

    expect(
      ModuleLessonGenerationApiResponseSchema.parse({
        state: 'not_found',
        planId,
        moduleId,
      }),
    ).toMatchObject({ state: 'not_found' });

    expect(
      ModuleLessonGenerationApiResponseSchema.parse({
        state: 'locked',
        planId,
        moduleId,
      }),
    ).toMatchObject({ state: 'locked' });
  });

  it('rejects quota_denied when limit is not an integer', () => {
    const planId = randomUUID();
    const moduleId = randomUUID();
    expect(() =>
      ModuleLessonGenerationApiResponseSchema.parse({
        state: 'quota_denied',
        planId,
        moduleId,
        currentCount: 1,
        limit: 1.5,
      }),
    ).toThrow();
  });

  it('rejects legacy disabled encoding on failed + reason', () => {
    const planId = randomUUID();
    const moduleId = randomUUID();
    expect(() =>
      ModuleLessonGenerationApiResponseSchema.parse({
        state: 'failed',
        planId,
        moduleId,
        reason: 'disabled',
      }),
    ).toThrow();
  });
});
