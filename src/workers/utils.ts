/**
 * Shared utilities for worker processes
 */

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize an unknown error into a structured format
 */
export function normalizeError(error: unknown): {
  message: string;
  name?: string;
} {
  if (error instanceof Error) {
    return { message: error.message, name: error.name };
  }

  if (typeof error === 'string' && error.length) {
    return { message: error };
  }

  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: 'Unknown error' };
  }
}
