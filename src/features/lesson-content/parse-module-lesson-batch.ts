import type { ModuleLessonBatchProviderOutput } from '@/shared/types/lesson-content.types';

import { MAX_RAW_RESPONSE_CHARS } from '@/features/ai/constants';
import { ParserError } from '@/features/ai/parser';
import { readableStreamToAsyncIterable } from '@/features/ai/streaming/utils';
import { logger } from '@/lib/logging/logger';
import { ModuleLessonBatchProviderOutputSchema } from '@/shared/schemas/lesson-content.schemas';

function assertExpectedIdsWellFormed(
  expectedOrderedTaskIds: readonly string[],
): void {
  if (new Set(expectedOrderedTaskIds).size !== expectedOrderedTaskIds.length) {
    throw new ParserError(
      'invalid_input',
      'Expected task id list contains duplicate ids; fix caller ordering query.',
    );
  }
}

/**
 * Maps output tasks to `expectedOrderedTaskIds` by position. The prompt lists
 * tasks in DB order, so `tasks[i]` belongs to the i-th expected task. An
 * echoed id that matches no expected task (garbled or invented) is replaced
 * with the expected id, even when every id is garbled. An id that names a
 * different expected task means the model reordered or duplicated lessons,
 * so the batch is rejected.
 */
function assignTaskIdsByPosition(
  output: ModuleLessonBatchProviderOutput,
  expectedOrderedTaskIds: readonly string[],
): ModuleLessonBatchProviderOutput {
  assertExpectedIdsWellFormed(expectedOrderedTaskIds);

  if (output.tasks.length !== expectedOrderedTaskIds.length) {
    throw new ParserError(
      'validation',
      `Module lesson batch must include exactly ${String(expectedOrderedTaskIds.length)} tasks; got ${String(output.tasks.length)}.`,
    );
  }

  const expectedIndexById = new Map(
    expectedOrderedTaskIds.map((id, index) => [id, index]),
  );
  let repairedTaskIdCount = 0;

  const tasks = output.tasks.map((task, i) => {
    const expectedId = expectedOrderedTaskIds[i];
    if (task.taskId === expectedId) return task;

    const otherIndex = expectedIndexById.get(task.taskId);
    if (otherIndex !== undefined) {
      throw new ParserError(
        'validation',
        `tasks[${String(i)}].taskId names the task expected at index ${String(otherIndex)}; lessons must follow DB order.`,
      );
    }

    repairedTaskIdCount++;
    return { ...task, taskId: expectedId };
  });

  if (repairedTaskIdCount > 0) {
    logger.warn(
      { repairedTaskIdCount, taskCount: tasks.length },
      'Module lesson batch task ids repaired by position',
    );
  }

  return { ...output, tasks };
}

export type ParseModuleLessonBatchOptions = {
  readonly signal?: AbortSignal;
};

/**
 * Parses buffered provider text: JSON.parse → Zod → exact task count, with
 * task ids assigned by position from `expectedOrderedTaskIds`.
 */
export function parseModuleLessonBatchText(
  rawText: string,
  expectedOrderedTaskIds: readonly string[],
  options?: ParseModuleLessonBatchOptions,
): ModuleLessonBatchProviderOutput {
  options?.signal?.throwIfAborted();

  const buffer = rawText.trim();
  if (!buffer) {
    throw new ParserError(
      'invalid_json',
      'Module lesson batch response was empty.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(buffer);
    options?.signal?.throwIfAborted();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ParserError(
      'invalid_json',
      'Module lesson batch response was not valid JSON.',
      {
        cause: error,
      },
    );
  }

  const zodResult = ModuleLessonBatchProviderOutputSchema.safeParse(parsed);
  if (!zodResult.success) {
    throw new ParserError(
      'validation',
      `Module lesson batch failed schema validation: ${zodResult.error.message}`,
      { cause: zodResult.error },
    );
  }

  return assignTaskIdsByPosition(zodResult.data, expectedOrderedTaskIds);
}

export type ParseModuleLessonBatchFromStreamOptions =
  ParseModuleLessonBatchOptions & {
    /** Defaults to `MAX_RAW_RESPONSE_CHARS`. */
    readonly maxChars?: number;
  };

/**
 * Accumulates stream chunks to a string, failing past `maxChars`.
 */
export async function bufferModuleLessonBatchStream(
  stream: AsyncIterable<string> | ReadableStream<string>,
  options?: ParseModuleLessonBatchFromStreamOptions,
): Promise<string> {
  const maxChars = options?.maxChars ?? MAX_RAW_RESPONSE_CHARS;
  let buffer = '';
  const source =
    stream instanceof ReadableStream
      ? readableStreamToAsyncIterable(stream)
      : stream;

  for await (const chunk of source) {
    options?.signal?.throwIfAborted();
    if (buffer.length + chunk.length > maxChars) {
      throw new ParserError(
        'validation',
        `Module lesson batch response exceeds maximum size (${String(maxChars)} chars).`,
      );
    }
    buffer += chunk;
  }

  options?.signal?.throwIfAborted();
  return buffer;
}

/**
 * Accumulates stream chunks to a string, then runs `parseModuleLessonBatchText`.
 */
export async function parseModuleLessonBatchFromStream(
  stream: AsyncIterable<string> | ReadableStream<string>,
  expectedOrderedTaskIds: readonly string[],
  options?: ParseModuleLessonBatchFromStreamOptions,
): Promise<ModuleLessonBatchProviderOutput> {
  const buffer = await bufferModuleLessonBatchStream(stream, options);
  return parseModuleLessonBatchText(buffer, expectedOrderedTaskIds, options);
}
