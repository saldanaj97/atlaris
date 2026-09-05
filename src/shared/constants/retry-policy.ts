/** Provider retry bounds and job retry delays. Job attempt caps come from the queue row. */

/** Provider retries per AI call (2 total attempts including initial). */
export const MAX_PROVIDER_RETRIES = 1;

/** Base seconds for exponential backoff on job retries. */
export const JOB_RETRY_BASE_SECONDS = 2;

/** Cap for exponential retry delay in seconds (5 minutes). */
export const JOB_RETRY_MAX_DELAY_SECONDS = 300;

/** Minimum backoff (ms) for provider-level retry. */
export const PROVIDER_RETRY_MIN_MS = 300;

/** Maximum backoff (ms) for provider-level retry. */
export const PROVIDER_RETRY_MAX_MS = 700;
