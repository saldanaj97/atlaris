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

/**
 * Exhaustive check helper for discriminated unions.
 * Passing a value of type `never` ensures all cases are handled at compile time.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
