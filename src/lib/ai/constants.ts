/**
 * Shared constants for plan generation attempts.
 *
 * This file provides constants that need to be shared between client and server code.
 * These are hardcoded defaults that can be overridden by environment variables on the server.
 */

/**
 * Default maximum retry attempts for plan generation.
 *
 * Note: The server-side ATTEMPT_CAP in lib/db/queries/attempts.ts reads from
 * the ATTEMPT_CAP environment variable with this as the fallback default.
 * Keep these values in sync.
 */
export const DEFAULT_ATTEMPT_CAP = 3;
