/**
 * Canonical helpers for turning unknown thrown values into messages and safe
 * serializations. Call-site-specific shapes stay in thin wrappers.
 */

export function omitCircularFields(
  value: unknown,
  seen: WeakSet<object> = new WeakSet<object>()
): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => omitCircularFields(item, seen));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    sanitized[key] = omitCircularFields(fieldValue, seen);
  }

  return sanitized;
}

export function safeStringifyUnknown(value: unknown): string {
  try {
    return JSON.stringify(omitCircularFields(value));
  } catch {
    return '[Unserializable]';
  }
}

/**
 * Best-effort string for thrown or unknown values (logging / API messages).
 */
export function coerceUnknownToMessage(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (
    typeof value === 'bigint' ||
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

export type UnknownThrownCore = {
  primaryMessage: string;
  errorInstance: Error | undefined;
  name: string | undefined;
  stack: string | undefined;
  cause?: unknown;
};

/**
 * Single authority for extracting structured fields from an unknown thrown
 * value. Does not replace richer adapters (SSE ErrorLike, attempt errors).
 */
export function unknownThrownCore(value: unknown): UnknownThrownCore {
  if (value instanceof Error) {
    return {
      primaryMessage: value.message,
      errorInstance: value,
      name: value.name,
      stack: value.stack,
      cause: value.cause,
    };
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as { message?: unknown }).message === 'string'
  ) {
    const o = value as Record<string, unknown>;
    return {
      primaryMessage: o.message as string,
      errorInstance: undefined,
      name: typeof o.name === 'string' ? o.name : undefined,
      stack: typeof o.stack === 'string' ? o.stack : undefined,
      ...('cause' in o ? { cause: o.cause } : {}),
    };
  }

  return {
    primaryMessage: coerceUnknownToMessage(value),
    errorInstance: undefined,
    name: undefined,
    stack: undefined,
  };
}
