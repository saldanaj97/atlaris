import { readableStreamToAsyncIterable } from '@/features/ai/streaming/utils';
import { MAX_RAW_RESPONSE_CHARS } from '@/features/ai/constants';
import { ParserError } from '@/features/ai/parser';
import { ModuleLessonBatchProviderOutputSchema } from '@/shared/schemas/lesson-content.schemas';
import type { ModuleLessonBatchProviderOutput } from '@/shared/types/lesson-content.types';

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

function validateTaskCoverageAndOrder(
  tasks: readonly { taskId: string }[],
  expectedOrderedTaskIds: readonly string[],
): void {
  assertExpectedIdsWellFormed(expectedOrderedTaskIds);

  const outputIds = tasks.map((t) => t.taskId);

  if (outputIds.length !== expectedOrderedTaskIds.length) {
    throw new ParserError(
      'validation',
      `Module lesson batch must include exactly ${String(expectedOrderedTaskIds.length)} tasks; got ${String(outputIds.length)}.`,
    );
  }

  if (new Set(outputIds).size !== outputIds.length) {
    throw new ParserError(
      'validation',
      'Module lesson batch output contains duplicate taskId entries.',
    );
  }

  for (let i = 0; i < expectedOrderedTaskIds.length; i++) {
    if (outputIds[i] !== expectedOrderedTaskIds[i]) {
      throw new ParserError(
        'validation',
        `tasks[${String(i)}].taskId must match DB order (got ${outputIds[i] ?? '(missing)'}, expected ${expectedOrderedTaskIds[i] ?? '(missing)'}).`,
      );
    }
  }
}

export type ParseModuleLessonBatchOptions = {
  readonly signal?: AbortSignal;
};

/**
 * Parses buffered provider text: JSON.parse → Zod → exact task id set + strict order vs `expectedOrderedTaskIds`.
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

  validateTaskCoverageAndOrder(zodResult.data.tasks, expectedOrderedTaskIds);
  return zodResult.data;
}

export type ParseModuleLessonBatchFromStreamOptions =
  ParseModuleLessonBatchOptions & {
    /** Defaults to `MAX_RAW_RESPONSE_CHARS`. */
    readonly maxChars?: number;
  };

/**
 * Accumulates stream chunks to a string, then runs `parseModuleLessonBatchText`.
 */
export async function parseModuleLessonBatchFromStream(
  stream: AsyncIterable<string> | ReadableStream<string>,
  expectedOrderedTaskIds: readonly string[],
  options?: ParseModuleLessonBatchFromStreamOptions,
): Promise<ModuleLessonBatchProviderOutput> {
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
  return parseModuleLessonBatchText(buffer, expectedOrderedTaskIds, options);
}
