/**
 * SSE error sanitizer — maps internal errors to safe client-facing messages.
 *
 * Raw error details (stack traces, provider messages, etc.) are logged
 * server-side only.  The client receives a deterministic, classification-based
 * message via the SSE error event.
 *
 * @module lib/ai/streaming/error-sanitizer
 */

import { logger } from '@/lib/logging/logger';
import type { FailureClassification } from '@/lib/types/client';

export interface ErrorLike {
  name?: string;
  message?: string;
  stack?: string;
  cause?: unknown;
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

function stringifyUnknownError(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol' ||
    value === null ||
    value === undefined
  ) {
    return String(value);
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as { message?: unknown }).message === 'string'
  ) {
    return (value as { message: string }).message;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return 'Unserializable error value';
  }
}

/** Classification-based safe error mapping */
const ERROR_MAP: Record<FailureClassification | 'unknown', SanitizedSseError> =
  {
    timeout: {
      code: 'GENERATION_TIMEOUT',
      message: 'Plan generation timed out. Please try again.',
      retryable: true,
    },
    rate_limit: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please wait a moment and try again.',
      retryable: true,
    },
    provider_error: {
      code: 'GENERATION_FAILED',
      message: 'Plan generation encountered an error. Please try again.',
      retryable: true,
    },
    validation: {
      code: 'INVALID_OUTPUT',
      message:
        'Plan generation produced invalid output. Please try with different parameters.',
      retryable: false,
    },
    capped: {
      code: 'ATTEMPTS_EXHAUSTED',
      message: 'Maximum generation attempts reached. Please create a new plan.',
      retryable: false,
    },
    in_progress: {
      code: 'GENERATION_IN_PROGRESS',
      message:
        'A generation is already in progress for this plan. Please wait and try again.',
      retryable: true,
    },
    unknown: {
      code: 'GENERATION_FAILED',
      message: 'An unexpected error occurred during plan generation.',
      retryable: false,
    },
  };

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
  error: GenerationError | ErrorLike,
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

  return ERROR_MAP[classification] ?? ERROR_MAP.unknown;
}
