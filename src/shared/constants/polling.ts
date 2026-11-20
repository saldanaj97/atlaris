export const INITIAL_POLL_MS = 1_000;

export const PLAN_STATUS_FETCH_TIMEOUT_MS = 30_000;

export const MAX_POLL_MS = 10_000;

export const BACKOFF_MULTIPLIER = 1.5;

export const JITTER_FACTOR = 0.2;

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
