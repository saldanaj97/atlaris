/**
 * SSE error sanitizer — maps internal errors to safe client-facing messages.
 *
 * Raw error details (stack traces, provider messages, etc.) are logged
 * server-side only.  The client receives a deterministic, classification-based
 * message via the SSE error event.
 *
 * @module lib/ai/streaming/error-sanitizer
 */

import {
  getFailurePresentation,
  type FailurePresentation,
} from '@/lib/ai/failure-presentation';
import { logger } from '@/lib/logging/logger';
import type { FailureClassification } from '@/lib/types/client';

export interface ErrorLike {
  name?: string;
  message?: string;
  stack?: string;
  // Native Error.cause can carry arbitrary values; keep this broad but bounded.
  cause?: Error | string | object | null;
  status?: number;
  statusCode?: number;
  response?: { status?: number } | null;
}

export type GenerationError = Error | DOMException | string | ErrorLike;

export interface SanitizedSseError {
  code: string;
  message: string;
  retryable: boolean;
}

type PrimitiveErrorValue = string | number | boolean | null | undefined;

type Serializable =
  | PrimitiveErrorValue
  | Serializable[]
  | { [key: string]: Serializable };

type MessageErrorShape = { message: string };
type ToStringErrorShape = { toString(): string };

type StringifyErrorValue =
  | PrimitiveErrorValue
  | MessageErrorShape
  | ToStringErrorShape
  | Serializable;

function stringifyUnknownError(value: StringifyErrorValue): string {
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
  if (
    typeof value === 'object' &&
    'toString' in value &&
    value.toString !== Object.prototype.toString
  ) {
    const toStringResult = (value as { toString(): unknown }).toString();
    if (
      typeof toStringResult === 'string' &&
      toStringResult.length > 0 &&
      toStringResult !== '[object Object]'
    ) {
      return toStringResult;
    }
  }

  try {
    return JSON.stringify(value);
  } catch {
    return 'Unserializable error value';
  }
}

/**
 * Sanitize an error for SSE output. Maps internal errors to safe public messages.
 * Raw error details are logged server-side only.
 *
 * @param error - The raw error object or string
 * @param classification - The failure classification determined by the orchestrator
 * @param context - Optional context for structured logging
 * @returns A safe, deterministic error payload for the SSE stream
 */
export function sanitizeSseError(
  error: GenerationError,
  classification: FailureClassification | 'unknown',
  context?: { planId?: string; userId?: string }
): SanitizedSseError {
  // Log the full error details server-side
  logger.error(
    {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name, stack: error.stack }
          : stringifyUnknownError(error),
      classification,
      ...(context ? { context } : {}),
    },
    'Generation error (sanitized for client)'
  );

  const presentation: FailurePresentation =
    getFailurePresentation(classification);

  return {
    code: presentation.code,
    message: presentation.message,
    retryable: presentation.retryable,
  };
}
