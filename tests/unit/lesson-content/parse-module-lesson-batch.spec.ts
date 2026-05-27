import { ParserError } from '@/features/ai/parser';
import {
  parseModuleLessonBatchFromStream,
  parseModuleLessonBatchText,
} from '@/features/lesson-content/parse-module-lesson-batch';
import { MAX_LESSON_BLOCK_TEXT_LENGTH } from '@supabase/schema/constants';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const taskA = randomUUID();
const taskB = randomUUID();

const sampleBlock = { type: 'heading' as const, text: 'Hi' };

function validPayload() {
  return {
    version: 1 as const,
    tasks: [
      {
        taskId: taskA,
        content: { version: 1 as const, blocks: [sampleBlock] },
      },
      {
        taskId: taskB,
        content: { version: 1 as const, blocks: [sampleBlock] },
      },
    ],
  };
}

describe('parseModuleLessonBatchText', () => {
  it('accepts valid JSON matching expected order', () => {
    const json = JSON.stringify(validPayload());
    const out = parseModuleLessonBatchText(json, [taskA, taskB]);
    expect(out.tasks).toHaveLength(2);
    expect(out.tasks[0].taskId).toBe(taskA);
  });

  it('rejects empty payload', () => {
    expect(() => parseModuleLessonBatchText('   ', [taskA])).toThrow(
      ParserError,
    );
  });

  it('rejects malformed JSON', () => {
    expect(() => parseModuleLessonBatchText('{', [taskA])).toThrow(ParserError);
  });

  it('rejects wrong top-level version after JSON parse', () => {
    const bad = JSON.stringify({ version: 2, tasks: [] });
    expect(() => parseModuleLessonBatchText(bad, [])).toThrow(ParserError);
  });

  it('rejects missing task id', () => {
    const oneTask = {
      version: 1,
      tasks: [
        { taskId: taskA, content: { version: 1, blocks: [sampleBlock] } },
      ],
    };
    const json = JSON.stringify(oneTask);
    expect(() => parseModuleLessonBatchText(json, [taskA, taskB])).toThrow(
      ParserError,
    );
  });

  it('rejects extra task id', () => {
    const extra = {
      version: 1,
      tasks: [
        { taskId: taskA, content: { version: 1, blocks: [sampleBlock] } },
        { taskId: taskB, content: { version: 1, blocks: [sampleBlock] } },
        {
          taskId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          content: { version: 1, blocks: [sampleBlock] },
        },
      ],
    };
    expect(() =>
      parseModuleLessonBatchText(JSON.stringify(extra), [taskA, taskB]),
    ).toThrow(ParserError);
  });

  it('rejects duplicate output task ids', () => {
    const dup = {
      version: 1,
      tasks: [
        { taskId: taskA, content: { version: 1, blocks: [sampleBlock] } },
        { taskId: taskA, content: { version: 1, blocks: [sampleBlock] } },
      ],
    };
    expect(() =>
      parseModuleLessonBatchText(JSON.stringify(dup), [taskA, taskB]),
    ).toThrow(ParserError);
  });

  it('rejects same set but wrong order vs DB', () => {
    const swapped = {
      version: 1,
      tasks: [
        { taskId: taskB, content: { version: 1, blocks: [sampleBlock] } },
        { taskId: taskA, content: { version: 1, blocks: [sampleBlock] } },
      ],
    };
    expect(() =>
      parseModuleLessonBatchText(JSON.stringify(swapped), [taskA, taskB]),
    ).toThrow(ParserError);
  });

  it('rejects duplicate ids in expected list (caller bug)', () => {
    try {
      parseModuleLessonBatchText(JSON.stringify(validPayload()), [
        taskA,
        taskA,
      ]);
      throw new Error('expected ParserError');
    } catch (error) {
      expect(error).toBeInstanceOf(ParserError);
      expect((error as ParserError).kind).toBe('invalid_input');
    }
  });

  it('rejects Zod block violation', () => {
    const badBlock = {
      version: 1,
      tasks: [
        {
          taskId: taskA,
          content: {
            version: 1,
            blocks: [
              {
                type: 'paragraph',
                text: 'x'.repeat(MAX_LESSON_BLOCK_TEXT_LENGTH + 1),
              },
            ],
          },
        },
        {
          taskId: taskB,
          content: { version: 1, blocks: [sampleBlock] },
        },
      ],
    };
    expect(() =>
      parseModuleLessonBatchText(JSON.stringify(badBlock), [taskA, taskB]),
    ).toThrow(ParserError);
  });
});

describe('parseModuleLessonBatchFromStream', () => {
  it('accumulates stream chunks then parses', async () => {
    const json = JSON.stringify(validPayload());
    const chunks = [json.slice(0, 4), json.slice(4)];
    async function* gen() {
      for (const c of chunks) yield c;
    }
    const out = await parseModuleLessonBatchFromStream(gen(), [taskA, taskB]);
    expect(out.version).toBe(1);
    expect(out.tasks[0].taskId).toBe(taskA);
  });
});
