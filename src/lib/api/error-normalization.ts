/**
 * Reusable utilities for normalizing thrown values and attempt-style errors
 * into a consistent shape (message + optional status fields) for logging and persistence.
 */

export interface AttemptErrorLike {
  message?: string;
  status?: number;
  statusCode?: number;
  httpStatus?: number;
}

export type AttemptErrorResult = {
  message: string;
  status?: number;
  statusCode?: number;
  httpStatus?: number;
};

export function isAttemptErrorLike(obj: unknown): obj is AttemptErrorLike {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }
  const o = obj as AttemptErrorLike;
  if (o.message !== undefined && typeof o.message !== 'string') {
    return false;
  }
  if (o.status !== undefined && typeof o.status !== 'number') {
    return false;
  }
  if (o.statusCode !== undefined && typeof o.statusCode !== 'number') {
    return false;
  }
  if (o.httpStatus !== undefined && typeof o.httpStatus !== 'number') {
    return false;
  }
  return true;
}

function extractStatusFields(
  obj: AttemptErrorLike
): Partial<AttemptErrorResult> {
  const fields: Partial<AttemptErrorResult> = {};
  if (typeof obj.status === 'number') {
    fields.status = obj.status;
  }
  if (typeof obj.statusCode === 'number') {
    fields.statusCode = obj.statusCode;
  }
  if (typeof obj.httpStatus === 'number') {
    fields.httpStatus = obj.httpStatus;
  }
  return fields;
}

/**
 * Normalizes an unknown thrown value into AttemptErrorResult (message + optional status fields).
 * Safe for persistence and client-facing error payloads.
 */
export function toAttemptError(error: unknown): AttemptErrorResult {
  if (typeof error === 'string') {
    return { message: error };
  }

  if (error instanceof Error) {
    const isAttempt = isAttemptErrorLike(error);
    const result: AttemptErrorResult = { message: error.message };
    if (isAttempt) {
      const errWithStatus = error as Error & AttemptErrorLike;
      Object.assign(result, extractStatusFields(errWithStatus));
    }
    return result;
  }

  if (isAttemptErrorLike(error)) {
    const message =
      typeof error.message === 'string'
        ? error.message
        : 'Unknown retry generation error';
    const result: AttemptErrorResult = { message };
    Object.assign(result, extractStatusFields(error));
    return result;
  }

  return { message: 'Unknown retry generation error' };
}

export function stringifyThrownValue(value: unknown): string {
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

/**
 * Ensures the value is an Error instance. Wraps non-Error thrown values in an Error.
 */
export function normalizeThrownError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(
    `Non-Error thrown during retry generation: ${stringifyThrownValue(error)}`
  );
}
