import {
  MAX_MODULE_COUNT,
  MAX_RAW_RESPONSE_CHARS,
  MAX_TASKS_PER_MODULE,
} from '@/features/ai/constants';
import { ParserError, parseGenerationStream } from '@/features/ai/parser';
import { describe, expect, it } from 'vitest';

async function* streamFromString(value: string) {
  yield value;
}

describe('Generation parser validation', () => {
  it('throws invalid_json error when JSON cannot be parsed', async () => {
    await expect(
      parseGenerationStream(streamFromString('{ invalid json')),
    ).rejects.toBeInstanceOf(ParserError);
    await expect(
      parseGenerationStream(streamFromString('{ invalid json')),
    ).rejects.toMatchObject({
      kind: 'invalid_json',
    });
  });

  it('throws validation error when modules array is empty', async () => {
    const payload = JSON.stringify({ modules: [] });
    await expect(
      parseGenerationStream(streamFromString(payload)),
    ).rejects.toBeInstanceOf(ParserError);
    await expect(
      parseGenerationStream(streamFromString(payload)),
    ).rejects.toMatchObject({
      kind: 'validation',
    });
  });

  it('throws validation error when raw response exceeds max size', async () => {
    await expect(
      parseGenerationStream(
        streamFromString('x'.repeat(MAX_RAW_RESPONSE_CHARS + 1)),
      ),
    ).rejects.toMatchObject({
      kind: 'validation',
    });
  });

  it('throws validation error when module count exceeds max', async () => {
    const payload = JSON.stringify({
      modules: Array.from({ length: MAX_MODULE_COUNT + 1 }, (_, index) => ({
        title: `Module ${index + 1}`,
        estimated_minutes: 60,
        tasks: [{ title: 'Task 1', estimated_minutes: 30 }],
      })),
    });

    await expect(
      parseGenerationStream(streamFromString(payload)),
    ).rejects.toMatchObject({
      kind: 'validation',
    });
  });

  it('throws validation error when task count exceeds max per module', async () => {
    const payload = JSON.stringify({
      modules: [
        {
          title: 'Module 1',
          estimated_minutes: 120,
          tasks: Array.from(
            { length: MAX_TASKS_PER_MODULE + 1 },
            (_, taskIndex) => ({
              title: `Task ${taskIndex + 1}`,
              estimated_minutes: 30,
            }),
          ),
        },
      ],
    });

    await expect(
      parseGenerationStream(streamFromString(payload)),
    ).rejects.toMatchObject({
      kind: 'validation',
    });
  });
});
