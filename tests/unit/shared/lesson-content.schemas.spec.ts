import { describe, expect, it } from 'vitest';

import {
  MAX_LESSON_BLOCK_TEXT_LENGTH,
  MAX_LESSON_BLOCKS_PER_TASK,
  MAX_LESSON_LIST_ITEM_LENGTH,
  MAX_LESSON_LIST_ITEMS,
  MAX_MODULE_LESSON_BATCH_TASKS,
} from '@supabase/schema/constants';
import {
  LessonContentSchema,
  ModuleLessonBatchProviderOutputSchema,
  ModuleLessonGenerationMetadataSchema,
} from '@/shared/schemas/lesson-content.schemas';

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

  it('allows empty blocks array', () => {
    const parsed = LessonContentSchema.parse({ version: 1, blocks: [] });
    expect(parsed.blocks).toHaveLength(0);
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
    const taskId = '11111111-1111-4111-8111-111111111111';
    const parsed = ModuleLessonBatchProviderOutputSchema.parse({
      version: 1,
      tasks: [{ taskId, content: sampleContent }],
    });
    expect(parsed.tasks).toHaveLength(1);
  });

  it('rejects too many tasks in batch output', () => {
    const taskId = '22222222-2222-4222-8222-222222222222';
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
});
