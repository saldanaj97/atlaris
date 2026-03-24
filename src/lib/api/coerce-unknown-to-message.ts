/**
 * Best-effort string for thrown or unknown values (logging / API messages).
 */
export function coerceUnknownToMessage(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    value === undefined
  ) {
    return String(value);
  }

  if (typeof value === 'symbol') {
    return value.toString();
  }

  if (typeof value === 'function') {
    return `[Function: ${value.name || 'anonymous'}]`;
  }

  if (
    typeof value === 'object' &&
    'message' in value &&
    typeof (value as { message?: unknown }).message === 'string'
  ) {
    return (value as { message: string }).message;
  }

  try {
    const result = JSON.stringify(value);
    if (typeof result === 'string') {
      return result;
    }
    return 'Unserializable thrown value';
  } catch {
    return 'Unserializable thrown value';
  }
}
