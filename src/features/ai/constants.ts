/**
 * Shared constants for plan generation attempts.
 *
 * This file provides constants that need to be shared between client and server code.
 * These are hardcoded defaults that can be overridden by environment variables on the server.
 */

export { DEFAULT_ATTEMPT_CAP } from '@/shared/constants/generation';

export const MAX_RAW_RESPONSE_CHARS = 200_000;

export const MAX_MODULE_COUNT = 12;

export const MAX_TASKS_PER_MODULE = 20;

export const NOTES_PROMPT_MAX_CHARS = 1_500;

export const TOPIC_PROMPT_MAX_CHARS = 500;

export const DEFAULT_CLASSIFICATION = 'provider_error' as const;
