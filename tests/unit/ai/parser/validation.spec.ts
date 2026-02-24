import { describe, expect, it, vi } from 'vitest';

import {
  MAX_MODULE_COUNT,
  MAX_RAW_RESPONSE_CHARS,
  MAX_TASKS_PER_MODULE,
  parseGenerationStream,
  ParserError,
} from '@/lib/ai/parser';

async function* streamFromString(value: string) {
  yield value;
}

async function* streamFromChunks(chunks: string[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe('Generation parser validation', () => {
  it('throws invalid_json error when JSON cannot be parsed', async () => {
    await expect(
      parseGenerationStream(streamFromString('{ invalid json'))
    ).rejects.toBeInstanceOf(ParserError);
    await expect(
      parseGenerationStream(streamFromString('{ invalid json'))
    ).rejects.toMatchObject({
      kind: 'invalid_json',
    });
  });

  it('throws validation error when modules array is empty', async () => {
    const payload = JSON.stringify({ modules: [] });
    await expect(
      parseGenerationStream(streamFromString(payload))
    ).rejects.toBeInstanceOf(ParserError);
    await expect(
      parseGenerationStream(streamFromString(payload))
    ).rejects.toMatchObject({
      kind: 'validation',
    });
  });

  it('invokes callback when first module is detected', async () => {
    const payload = JSON.stringify({
      modules: [
        {
          title: 'Module 1',
          estimated_minutes: 120,
          tasks: [{ title: 'Task 1', estimated_minutes: 60 }],
        },
      ],
    });

    const chunks = [payload.slice(0, 12), payload.slice(12)];
    const callback = vi.fn();

    const result = await parseGenerationStream(streamFromChunks(chunks), {
      onFirstModuleDetected: callback,
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(result.modules).toHaveLength(1);
  });

  it('throws validation error when raw response exceeds max size', async () => {
    await expect(
      parseGenerationStream(
        streamFromString('x'.repeat(MAX_RAW_RESPONSE_CHARS + 1))
      )
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
      parseGenerationStream(streamFromString(payload))
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
            })
          ),
        },
      ],
    });

    await expect(
      parseGenerationStream(streamFromString(payload))
    ).rejects.toMatchObject({
      kind: 'validation',
    });
  });
});
