import {
  safeStringifyUnknown,
  unknownThrownCore,
} from '@/lib/errors/normalize-unknown';

export function isAbortError(error: unknown): boolean {
  const hasDomException = typeof DOMException !== 'undefined';

  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  ) {
    return true;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.startsWith('AbortError')
  ) {
    return true;
  }

  return (
    (hasDomException &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

export function normalizeThrown(
  value: unknown,
): Error | { message: string; name?: string } {
  if (value instanceof Error) {
    return value;
  }

  const core = unknownThrownCore(value);
  const hasObjectStringMessage =
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as { message?: unknown }).message === 'string';

  if (hasObjectStringMessage) {
    return core.name
      ? { message: core.primaryMessage, name: core.name }
      : { message: core.primaryMessage };
  }

  return { message: core.primaryMessage };
}

export function getLoggableErrorDetails(error: unknown): {
  errorMessage: string;
  errorStack?: string;
} {
  const core = unknownThrownCore(error);
  const hasObjectStringMessage =
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string';

  if (core.errorInstance || hasObjectStringMessage) {
    return {
      errorMessage: core.primaryMessage,
      ...(core.stack ? { errorStack: core.stack } : {}),
    };
  }

  if (typeof error === 'object' && error !== null) {
    const hasMessage =
      'message' in error &&
      typeof (error as { message?: unknown }).message === 'string';
    const hasStack =
      'stack' in error &&
      typeof (error as { stack?: unknown }).stack === 'string';

    if (hasMessage || hasStack) {
      // Preserve stack-only objects as error-like logs without forcing the
      // serializer fallback message into observability surfaces.
      return {
        errorMessage: hasMessage
          ? (error as { message: string }).message
          : 'Unknown error object',
        ...(hasStack ? { errorStack: (error as { stack: string }).stack } : {}),
      };
    }

    return {
      errorMessage: safeStringifyUnknown(error),
    };
  }

  return { errorMessage: core.primaryMessage };
}

const MAX_SERIALIZE_ERROR_DEPTH = 8;
const MAX_ENUMERABLE_ERROR_PROPS = 24;
const MAX_ERROR_STRING_CHARS = 2000;

function clipLogText(value: string, maxLen: number): string {
  if (value.length <= maxLen) {
    return value;
  }
  return `${value.slice(0, maxLen)}…`;
}

function serializeValueForLogNested(
  value: unknown,
  depth: number,
): Record<string, unknown> | unknown {
  if (depth > MAX_SERIALIZE_ERROR_DEPTH) {
    return '[MaxDepth]';
  }

  if (value instanceof Error) {
    return serializeErrorForLogObject(value, depth + 1);
  }

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'symbol') {
    return value.toString();
  }

  if (typeof value === 'function') {
    return `[Function: ${value.name || 'anonymous'}]`;
  }

  if (typeof value === 'object') {
    const preview = safeStringifyUnknown(value);
    return clipLogText(preview, MAX_ERROR_STRING_CHARS);
  }

  return String(value);
}

function serializeErrorForLogObject(
  err: Error,
  depth: number,
): Record<string, unknown> {
  if (depth > MAX_SERIALIZE_ERROR_DEPTH) {
    return {
      name: err.name,
      message: clipLogText(err.message, MAX_ERROR_STRING_CHARS),
      truncated: true,
    };
  }

  const result: Record<string, unknown> = {
    name: err.name,
    message: clipLogText(err.message, MAX_ERROR_STRING_CHARS),
  };

  if (err.stack) {
    result.stack = clipLogText(err.stack, MAX_ERROR_STRING_CHARS * 2);
  }

  if ('cause' in err && err.cause !== undefined) {
    const cause = err.cause;
    result.cause =
      cause instanceof Error
        ? serializeErrorForLogObject(cause, depth + 1)
        : serializeValueForLogNested(cause, depth + 1);
  }

  let appended = 0;
  for (const key of Object.keys(err)) {
    if (
      key === 'name' ||
      key === 'message' ||
      key === 'stack' ||
      key === 'cause'
    ) {
      continue;
    }
    if (appended >= MAX_ENUMERABLE_ERROR_PROPS) {
      result.extraTruncated = true;
      break;
    }
    appended += 1;
    try {
      const v = Reflect.get(err as object, key) as unknown;
      result[key] = serializeValueForLogNested(v, depth + 1);
    } catch {
      result[key] = '[Unreadable]';
    }
  }

  return result;
}

export function serializeErrorForLog(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return serializeErrorForLogObject(error, 0);
  }

  if (typeof error === 'object' && error !== null) {
    const details = getLoggableErrorDetails(error);
    return {
      kind: 'object',
      ...details,
      preview: clipLogText(safeStringifyUnknown(error), MAX_ERROR_STRING_CHARS),
    };
  }

  return { value: clipLogText(String(error), MAX_ERROR_STRING_CHARS) };
}

/**
 * Exhaustive check helper for discriminated unions.
 * Passing a value of type `never` ensures all cases are handled at compile time.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
