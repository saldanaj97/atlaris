export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function normalizeThrown(value: unknown): Error | { message?: string } {
  return value instanceof Error ? value : { message: String(value) };
}
