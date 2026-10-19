import { ParserError } from '@/features/ai/parser';
import {
  bufferModuleLessonBatchStream,
  parseModuleLessonBatchText,
} from '@/features/lesson-content/parse-module-lesson-batch';
import { logger } from '@/lib/logging/logger';
import { MAX_LESSON_BLOCK_TEXT_LENGTH } from '@supabase/schema/constants';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('assigns the expected id by position when one echoed id is garbled', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const garbled = {
      version: 1,
      tasks: [
        {
          taskId: `${taskA.slice(0, -1)}`,
          content: { version: 1, blocks: [{ type: 'heading', text: 'A' }] },
        },
        {
          taskId: taskB,
          content: { version: 1, blocks: [{ type: 'heading', text: 'B' }] },
        },
      ],
    };
    const out = parseModuleLessonBatchText(JSON.stringify(garbled), [
      taskA,
      taskB,
    ]);
    expect(out.tasks.map((t) => t.taskId)).toEqual([taskA, taskB]);
    expect(out.tasks[0].content.blocks[0]).toMatchObject({ text: 'A' });
    expect(out.tasks[1].content.blocks[0]).toMatchObject({ text: 'B' });
    expect(warn).toHaveBeenCalledWith(
      { repairedTaskIdCount: 1, taskCount: 2 },
      'Module lesson batch task ids repaired by position',
    );
  });

  it('assigns ids by position when every echoed id is wrong but the count matches', () => {
    const allWrong = {
      version: 1,
      tasks: [
        { taskId: 'task-1', content: { version: 1, blocks: [sampleBlock] } },
        {
          taskId: randomUUID(),
          content: { version: 1, blocks: [sampleBlock] },
        },
      ],
    };
    const out = parseModuleLessonBatchText(JSON.stringify(allWrong), [
      taskA,
      taskB,
    ]);
    expect(out.tasks.map((t) => t.taskId)).toEqual([taskA, taskB]);
  });

  it('rejects a garbled id when the task count is wrong', () => {
    const short = {
      version: 1,
      tasks: [
        {
          taskId: 'not-a-uuid',
          content: { version: 1, blocks: [sampleBlock] },
        },
      ],
    };
    expect(() =>
      parseModuleLessonBatchText(JSON.stringify(short), [taskA, taskB]),
    ).toThrow(ParserError);
  });

  it('rejects a valid id at another position even when the rest is garbled', () => {
    const misplaced = {
      version: 1,
      tasks: [
        { taskId: 'garbled', content: { version: 1, blocks: [sampleBlock] } },
        { taskId: taskA, content: { version: 1, blocks: [sampleBlock] } },
      ],
    };
    expect(() =>
      parseModuleLessonBatchText(JSON.stringify(misplaced), [taskA, taskB]),
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

describe('bufferModuleLessonBatchStream', () => {
  it('accumulates stream chunks into parseable text', async () => {
    const json = JSON.stringify(validPayload());
    const chunks = [json.slice(0, 4), json.slice(4)];
    async function* gen() {
      for (const c of chunks) yield c;
    }
    const buffer = await bufferModuleLessonBatchStream(gen());
    expect(buffer).toBe(json);
    const out = parseModuleLessonBatchText(buffer, [taskA, taskB]);
    expect(out.version).toBe(1);
    expect(out.tasks[0].taskId).toBe(taskA);
  });
});
