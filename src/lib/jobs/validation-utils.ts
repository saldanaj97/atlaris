import { ZodError } from 'zod';

/**
 * Builds a human-readable error message from a Zod validation error.
 * Used by job handlers to format validation errors for job failure records.
 */
export function buildValidationErrorMessage(error: ZodError): string {
  const details = error.issues.map((issue) => issue.message).join('; ');
  return details.length
    ? `Invalid job data: ${details}`
    : 'Invalid job data payload.';
}
