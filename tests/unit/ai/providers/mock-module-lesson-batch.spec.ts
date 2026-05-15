import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { MockGenerationProvider } from '@/features/ai/providers/mock';
import { readableStreamToAsyncIterable } from '@/features/ai/streaming/utils';
import { ModuleLessonBatchProviderOutputSchema } from '@/shared/schemas/lesson-content.schemas';

const TASK_IDS = [randomUUID(), randomUUID()] as const;

async function collectStream(stream: ReadableStream<string>): Promise<string> {
  let output = '';
  for await (const chunk of readableStreamToAsyncIterable(stream)) {
    output += chunk;
  }
  return output;
}

describe('MockGenerationProvider.generateModuleLessonBatch', () => {
  it('streams JSON matching ModuleLessonBatchProviderOutputSchema for taskIds', async () => {
    const provider = new MockGenerationProvider({ delayMs: 0, failureRate: 0 });
    const { stream, metadata } = await provider.generateModuleLessonBatch({
      systemPrompt: 'system',
      userPrompt: 'user',
      taskIds: TASK_IDS,
    });

    const raw = await collectStream(stream);
    const parsed = JSON.parse(raw) as unknown;
    const batch = ModuleLessonBatchProviderOutputSchema.parse(parsed);

    expect(batch.version).toBe(1);
    expect(batch.tasks).toHaveLength(2);
    expect(batch.tasks.map((row) => row.taskId)).toEqual([...TASK_IDS]);
    expect(metadata.provider).toBe('mock');
    expect(metadata.model).toBe('mock-module-lesson-batch-v1');
    expect(metadata.usage?.totalTokens).toBe(920);
  });
});
