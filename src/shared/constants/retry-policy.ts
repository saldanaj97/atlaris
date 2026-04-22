/**
 * Centralized retry-policy constants for plan generation.
 * Single source of truth for retry bounds across all generation paths.
 *
 * Located in shared/ so both lib/ and features/ layers can import safely.
 *
 * Retry layers:
 *   1. Provider (p-retry): MAX_PROVIDER_RETRIES attempts per AI call
 *   2. Job queue: MAX_JOB_RETRIES attempts per enqueued job
 *   3. Per-plan: DEFAULT_ATTEMPT_CAP user-initiated retries
 *
 * Total AI calls per job = MAX_JOB_RETRIES × (MAX_PROVIDER_RETRIES + 1)
 * This is bounded by MAX_TOTAL_AI_CALLS_PER_JOB.
 */

/** p-retry retries per AI call (2 total attempts including initial). */
export const MAX_PROVIDER_RETRIES = 1;

/** Max job-level retry attempts before permanent failure. */
export const MAX_JOB_RETRIES = 3;

/** Upper bound on total AI calls a single job can trigger. */
export const MAX_TOTAL_AI_CALLS_PER_JOB =
	MAX_JOB_RETRIES * (MAX_PROVIDER_RETRIES + 1); // = 6

/** Base seconds for exponential backoff on job retries. */
export const JOB_RETRY_BASE_SECONDS = 2;

/** Cap for exponential retry delay in seconds (5 minutes). */
export const JOB_RETRY_MAX_DELAY_SECONDS = 300;

/** Minimum backoff (ms) for provider-level p-retry. */
export const PROVIDER_RETRY_MIN_MS = 300;

/** Maximum backoff (ms) for provider-level p-retry. */
export const PROVIDER_RETRY_MAX_MS = 700;
