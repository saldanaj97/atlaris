import {
  MAX_MODULE_COUNT,
  MAX_RAW_RESPONSE_CHARS,
  MAX_TASKS_PER_MODULE,
} from '@/features/ai/constants';
import { readableStreamToAsyncIterable } from '@/features/ai/streaming/utils';
import type {
  ParsedGeneration,
  ParsedModule,
  ParsedTask,
  ParserCallbacks,
  ParserErrorKind,
} from '@/features/ai/types/parser.types';
import {
  MAX_MODULE_TITLE_LENGTH,
  MAX_TASK_TITLE_LENGTH,
} from '@/lib/db/schema/constants';

export class ParserError extends Error {
  constructor(
    public readonly kind: ParserErrorKind,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'ParserError';
  }
}

function hasDetectedModule(buffer: string): boolean {
  return /"modules"\s*:\s*[{[]/.test(buffer);
}

function ensureString(value: unknown, path: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  throw new ParserError('validation', `${path} must be a non-empty string.`);
}

function ensureOptionalString(
  value: unknown,
  path: string
): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value.trim() || undefined;
  throw new ParserError(
    'validation',
    `${path} must be a string when provided.`
  );
}

function ensureNumber(value: unknown, path: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  throw new ParserError('validation', `${path} must be a finite number.`);
}

/**
 * Validates `value` as a non-empty string, truncates to `maxLength`, and
 * guarantees the result is non-empty. Misconfigured `maxLength` (non-positive)
 * or impossible truncation surface as configuration errors referencing
 * `limitConstantName`.
 */
function truncateValidatedString(
  value: unknown,
  maxLength: number,
  path: string,
  limitConstantName: string
): string {
  if (!Number.isInteger(maxLength) || maxLength <= 0) {
    throw new ParserError(
      'validation',
      `Invalid configuration: ${limitConstantName} must be a positive integer (got ${String(maxLength)}).`
    );
  }
  const trimmed = ensureString(value, path);
  const truncated = trimmed.slice(0, maxLength);
  // Invariant: trimmed is non-empty (ensureString) and maxLength > 0 (validated above),
  // so truncated is guaranteed non-empty.
  return truncated;
}

function toParsedTask(
  task: unknown,
  moduleIndex: number,
  taskIndex: number
): ParsedTask {
  if (!task || typeof task !== 'object') {
    throw new ParserError(
      'validation',
      `Task ${taskIndex + 1} in module ${moduleIndex + 1} is not an object.`
    );
  }

  const record = task as Record<string, unknown>;
  const title = truncateValidatedString(
    record.title ?? record.task,
    MAX_TASK_TITLE_LENGTH,
    `Task ${taskIndex + 1} in module ${moduleIndex + 1} title`,
    'MAX_TASK_TITLE_LENGTH'
  );
  const description = ensureOptionalString(
    record.description ?? record.summary,
    `Task ${taskIndex + 1} in module ${moduleIndex + 1} description`
  );
  const estimatedMinutes = ensureNumber(
    record.estimatedMinutes ?? record.estimated_minutes,
    `Task ${taskIndex + 1} estimated minutes`
  );

  return { title, description, estimatedMinutes };
}

function toParsedModule(module: unknown, moduleIndex: number): ParsedModule {
  if (!module || typeof module !== 'object') {
    throw new ParserError(
      'validation',
      `Module ${moduleIndex + 1} is not an object.`
    );
  }

  const record = module as Record<string, unknown>;
  const title = truncateValidatedString(
    record.title,
    MAX_MODULE_TITLE_LENGTH,
    `Module ${moduleIndex + 1} title`,
    'MAX_MODULE_TITLE_LENGTH'
  );
  const description = ensureOptionalString(
    record.description ?? record.summary,
    `Module ${moduleIndex + 1} description`
  );
  const estimatedMinutes = ensureNumber(
    record.estimatedMinutes ?? record.estimated_minutes,
    `Module ${moduleIndex + 1} estimated minutes`
  );

  const rawTasks = record.tasks;
  if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
    throw new ParserError(
      'validation',
      `Module ${moduleIndex + 1} must include at least one task.`
    );
  }
  if (rawTasks.length > MAX_TASKS_PER_MODULE) {
    throw new ParserError(
      'validation',
      `Module ${moduleIndex + 1} exceeds maximum tasks (${MAX_TASKS_PER_MODULE}).`
    );
  }

  const tasks = rawTasks.map((task, taskIndex) =>
    toParsedTask(task, moduleIndex, taskIndex)
  );

  return { title, description, estimatedMinutes, tasks };
}

export async function parseGenerationStream(
  stream: AsyncIterable<string> | ReadableStream<string>,
  callbacks: ParserCallbacks = {}
): Promise<ParsedGeneration> {
  let buffer = '';
  let moduleDetected = false;
  const source =
    stream instanceof ReadableStream
      ? readableStreamToAsyncIterable(stream)
      : stream;

  for await (const chunk of source) {
    callbacks.signal?.throwIfAborted();
    if (buffer.length + chunk.length > MAX_RAW_RESPONSE_CHARS) {
      throw new ParserError(
        'validation',
        `AI provider response exceeds maximum size (${MAX_RAW_RESPONSE_CHARS} chars).`
      );
    }
    buffer += chunk;
    if (
      !moduleDetected &&
      callbacks.onFirstModuleDetected &&
      hasDetectedModule(buffer)
    ) {
      moduleDetected = true;
      callbacks.onFirstModuleDetected();
    }
  }

  callbacks.signal?.throwIfAborted();

  if (!buffer.trim()) {
    throw new ParserError(
      'invalid_json',
      'AI provider returned an empty response.'
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(buffer);
    callbacks.signal?.throwIfAborted();
  } catch (error) {
    // Re-throw abort so callers can distinguish user cancellation from parse failures.
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ParserError(
      'invalid_json',
      'AI provider returned invalid JSON.',
      { cause: error }
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new ParserError(
      'validation',
      'AI provider response must be an object.'
    );
  }

  const modulesRaw = (parsed as Record<string, unknown>).modules;
  if (!Array.isArray(modulesRaw)) {
    throw new ParserError(
      'validation',
      'AI provider response missing modules array.'
    );
  }
  if (modulesRaw.length === 0) {
    throw new ParserError('validation', 'AI provider returned zero modules.');
  }
  if (modulesRaw.length > MAX_MODULE_COUNT) {
    throw new ParserError(
      'validation',
      `AI provider response exceeds maximum modules (${MAX_MODULE_COUNT}).`
    );
  }

  const modules: ParsedModule[] = [];
  for (let index = 0; index < modulesRaw.length; index++) {
    callbacks.signal?.throwIfAborted();
    modules.push(toParsedModule(modulesRaw[index], index));
  }

  return {
    modules,
    rawText: buffer,
  };
}
