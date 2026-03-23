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

  if (
    typeof value === 'object' &&
    'message' in value &&
    typeof (value as { message?: unknown }).message === 'string'
  ) {
    return (value as { message: string }).message;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return 'Unserializable thrown value';
  }
}
