import type { ZodError } from 'zod';

/**
 * Returns the first Zod issue message from a `safeParse`/`parse` failure,
 * or `undefined` when the error reports no issues. Callers typically fall
 * back to a generic "Invalid request" string when the result is `undefined`.
 *
 * Centralizing this avoids drift between routes that all want to surface
 * the most specific validation message to the caller.
 */
export function getFirstZodIssueMessage(error: ZodError): string | undefined {
	return error.issues[0]?.message;
}
