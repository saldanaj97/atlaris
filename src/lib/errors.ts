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
