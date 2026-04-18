/**
 * Shared constants for plan generation attempts.
 *
 * This file provides constants that need to be shared between client and server code.
 * These are hardcoded defaults that can be overridden by environment variables on the server.
 */

export { DEFAULT_ATTEMPT_CAP } from '@/shared/constants/generation';

/** Maximum raw response size (chars) from AI provider before parser rejects. */
export const MAX_RAW_RESPONSE_CHARS = 200_000;

/** Maximum number of modules allowed in parsed output. */
export const MAX_MODULE_COUNT = 12;

/** Maximum tasks per module allowed in parsed output. */
export const MAX_TASKS_PER_MODULE = 20;

/** Max chars for notes in user prompt sanitization. */
export const NOTES_PROMPT_MAX_CHARS = 1_500;

/** Max chars for topic in user prompt sanitization. */
export const TOPIC_PROMPT_MAX_CHARS = 500;

/** Max chars for PDF section title in prompt sanitization. */
export const PDF_SECTION_TITLE_MAX_CHARS = 200;

/** Default failure classification when error type is unrecognized. */
export const DEFAULT_CLASSIFICATION = 'provider_error' as const;
