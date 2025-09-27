export type ParserErrorKind = 'invalid_json' | 'validation';

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

export interface ParsedTask {
  title: string;
  description?: string;
  estimatedMinutes: number;
}

export interface ParsedModule {
  title: string;
  description?: string;
  estimatedMinutes: number;
  tasks: ParsedTask[];
}

export interface ParsedGeneration {
  modules: ParsedModule[];
  rawText: string;
}

export interface ParserCallbacks {
  onFirstModuleDetected?: () => void;
}

function hasDetectedModule(buffer: string): boolean {
  const modulesIndex = buffer.indexOf('"modules"');
  if (modulesIndex === -1) return false;
  const after = buffer.slice(modulesIndex);
  return after.includes('{');
}

function ensureString(value: unknown, path: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  throw new ParserError('validation', `${path} must be a non-empty string.`);
}

function ensureOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value.trim() || undefined;
  throw new ParserError(
    'validation',
    'Descriptions must be strings when provided.'
  );
}

function ensureNumber(value: unknown, path: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  throw new ParserError('validation', `${path} must be a finite number.`);
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
  const title = ensureString(
    record.title ?? record.task,
    `Task ${taskIndex + 1} title`
  );
  const description = ensureOptionalString(
    record.description ?? record.summary
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
  const title = ensureString(record.title, `Module ${moduleIndex + 1} title`);
  const description = ensureOptionalString(
    record.description ?? record.summary
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

  const tasks = rawTasks.map((task, taskIndex) =>
    toParsedTask(task, moduleIndex, taskIndex)
  );

  return { title, description, estimatedMinutes, tasks };
}

export async function parseGenerationStream(
  stream: AsyncIterable<string>,
  callbacks: ParserCallbacks = {}
): Promise<ParsedGeneration> {
  let buffer = '';
  let moduleDetected = false;

  for await (const chunk of stream) {
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

  if (!buffer.trim()) {
    throw new ParserError(
      'invalid_json',
      'AI provider returned an empty response.'
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(buffer);
  } catch (error) {
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

  const modules = modulesRaw.map((module, index) =>
    toParsedModule(module, index)
  );

  return {
    modules,
    rawText: buffer,
  };
}
