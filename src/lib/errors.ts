export function isAbortError(error: unknown): boolean {
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
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

export function normalizeThrown(
  value: unknown
): Error | { message: string; name?: string } {
  if (value instanceof Error) {
    return value;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
  ) {
    if ('name' in value && typeof value.name === 'string') {
      return { message: value.message, name: value.name };
    }
    return { message: value.message };
  }

  return { message: String(value) };
}

export function getLoggableErrorDetails(error: unknown): {
  errorMessage: string;
  errorStack?: string;
} {
  if (error instanceof Error) {
    return {
      errorMessage: error.message,
      errorStack: error.stack,
    };
  }

  if (typeof error === 'object' && error !== null) {
    const errorMessage =
      'message' in error && typeof error.message === 'string'
        ? error.message
        : undefined;
    const errorStack =
      'stack' in error && typeof error.stack === 'string'
        ? error.stack
        : undefined;

    if (errorMessage || errorStack) {
      return {
        errorMessage: errorMessage ?? 'Unknown error object',
        ...(errorStack ? { errorStack } : {}),
      };
    }

    try {
      return {
        errorMessage: JSON.stringify(error) ?? 'Unknown error object',
      };
    } catch {
      return { errorMessage: 'Unserializable error object' };
    }
  }

  return { errorMessage: String(error) };
}
