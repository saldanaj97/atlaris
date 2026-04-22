/**
 * Polling configuration for exponential backoff with jitter.
 *
 * Used by the plan-status polling hook to reduce unnecessary network
 * and database load while keeping the UI responsive to status changes.
 */

/** Delay (ms) for the very first poll after mount. */
export const INITIAL_POLL_MS = 1_000;

/** Upper bound (ms) for any single poll delay. */
export const MAX_POLL_MS = 10_000;

/** Multiplier applied to the current delay on each successive poll. */
export const BACKOFF_MULTIPLIER = 1.5;

/** ±20 % random jitter to prevent thundering-herd synchronisation. */
export const JITTER_FACTOR = 0.2;

/**
 * Compute the next poll delay using exponential backoff + jitter.
 *
 * 1. Multiply `currentDelay` by {@link BACKOFF_MULTIPLIER}.
 * 2. Cap at {@link MAX_POLL_MS}.
 * 3. Apply uniform random jitter in the range ±{@link JITTER_FACTOR}.
 * 4. Clamp the result to [{@link INITIAL_POLL_MS}, {@link MAX_POLL_MS}].
 */
export function computeNextDelay(
	currentDelay: number,
	randomFn: () => number = Math.random,
): number {
	if (!Number.isFinite(currentDelay) || currentDelay <= 0) {
		return INITIAL_POLL_MS;
	}
	const base = Math.min(currentDelay * BACKOFF_MULTIPLIER, MAX_POLL_MS);
	const jitter = 1 + (randomFn() * 2 - 1) * JITTER_FACTOR;
	return Math.max(INITIAL_POLL_MS, Math.min(base * jitter, MAX_POLL_MS));
}
