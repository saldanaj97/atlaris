import type { ErrorEvent, EventHint } from '@sentry/nextjs';

import { getEnvironment } from '@/lib/observability/sampling';

type WrappedBuildError = Error & { innerError: unknown };

const DEV_COMPILATION_ERROR_PATTERNS: RegExp[] = [
  /Parsing ecmascript source code failed/i,
  /Parsing .* source code failed/i,
  /Module not found/i,
  /Failed to compile/i,
  /Build Error/i,
  /Syntax Error/i,
  /Unexpected token/i,
  /Expected .+ but found/i,
  /Expected ';'/i,
  /Return statement is not allowed here/i,
  /Cannot find module/i,
];

function isWrappedBuildError(error: unknown): error is WrappedBuildError {
  return (
    error instanceof Error &&
    'innerError' in error &&
    error.innerError !== undefined
  );
}

function unwrapError(error: unknown): unknown {
  if (isWrappedBuildError(error)) {
    return error.innerError;
  }

  return error;
}

function getErrorMessage(error: unknown): string | undefined {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return undefined;
}

/**
 * Detect Turbopack/webpack compilation errors surfaced during local dev.
 * These are transient when a file is saved mid-edit with invalid syntax.
 */
export function isDevCompilationErrorMessage(message: string): boolean {
  return DEV_COMPILATION_ERROR_PATTERNS.some((pattern) =>
    pattern.test(message),
  );
}

/**
 * Returns true for transient dev-only compilation errors that should not be
 * reported to Sentry (e.g. mid-edit Turbopack parse failures on HMR).
 */
export function isTransientDevCompilationError(error: unknown): boolean {
  if (getEnvironment() !== 'development') {
    return false;
  }

  const candidates = [error, unwrapError(error)];

  for (const candidate of candidates) {
    const message = getErrorMessage(candidate);
    if (message && isDevCompilationErrorMessage(message)) {
      return true;
    }
  }

  return isWrappedBuildError(error);
}

/**
 * Gate for Next.js `onRequestError` before calling `captureRequestError`.
 */
export function shouldCaptureRequestError(error: unknown): boolean {
  return !isTransientDevCompilationError(error);
}

/**
 * Shared `beforeSend` hook for all Sentry init entrypoints.
 */
export function beforeSendSentryEvent(
  event: ErrorEvent,
  hint: EventHint,
): ErrorEvent | null {
  if (isTransientDevCompilationError(hint.originalException)) {
    return null;
  }

  const exceptionValue = event.exception?.values?.[0]?.value;
  if (
    typeof exceptionValue === 'string' &&
    getEnvironment() === 'development' &&
    isDevCompilationErrorMessage(exceptionValue)
  ) {
    return null;
  }

  return event;
}
