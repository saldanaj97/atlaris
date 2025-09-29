import { AlertCircle } from 'lucide-react';

import { type ApiError } from '@/lib/errors';

import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

interface ErrorAlertProps {
  error: ApiError | Error | string;
  title?: string;
}

/**
 * Type guard to check if an error is an ApiError
 */
function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    'code' in error &&
    typeof (error as ApiError).error === 'string' &&
    typeof (error as ApiError).code === 'string'
  );
}

/**
 * Extract message from any error type
 */
function getMessage(error: ApiError | Error | string): string {
  if (typeof error === 'string') {
    return error;
  }
  if (isApiError(error)) {
    return error.error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

/**
 * Extract error code from ApiError if available
 */
function getCode(error: ApiError | Error | string): string | undefined {
  if (isApiError(error)) {
    return error.code;
  }
  return undefined;
}

/**
 * Reusable error display component with standardized formatting
 */
export function ErrorAlert({ error, title = 'Error' }: ErrorAlertProps) {
  const message = getMessage(error);
  const code = getCode(error);

  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {message}
        {code && (
          <div className="mt-2 font-mono text-xs opacity-80">
            Error code: {code}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
