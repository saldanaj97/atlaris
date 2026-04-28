/**
 * Pure generation-policy constants shared across infrastructure and feature layers.
 *
 * These are deterministic values with no runtime dependencies.
 * The env-overridable ATTEMPT_CAP is computed via {@link resolveAttemptCap}
 * in both lib/config/env.ts (for lib consumers) and
 * features/ai/generation-policy.ts (for feature consumers and tests).
 */

/** Default maximum retry attempts for plan generation. */
export const DEFAULT_ATTEMPT_CAP = 3;

/**
 * Validate and normalize a raw attempt cap value.
 * Returns floored integer >= 1, or DEFAULT_ATTEMPT_CAP for invalid inputs.
 */
export function resolveAttemptCap(rawCap: number): number {
  if (!Number.isFinite(rawCap)) return DEFAULT_ATTEMPT_CAP;
  const floored = Math.floor(rawCap);
  return floored >= 1 ? floored : DEFAULT_ATTEMPT_CAP;
}

/** Maximum durable generation attempts per user within a rolling window. */
export const PLAN_GENERATION_LIMIT = 10;

/** Rolling window size (in minutes) for durable per-user generation limiting. */
export const PLAN_GENERATION_WINDOW_MINUTES = 60;

/** Rolling window size in milliseconds. */
export const PLAN_GENERATION_WINDOW_MS =
  PLAN_GENERATION_WINDOW_MINUTES * 60 * 1000;

/** Convenience helper for window-start derivation using a fixed "now". */
export function getPlanGenerationWindowStart(now: Date): Date {
  return new Date(now.getTime() - PLAN_GENERATION_WINDOW_MS);
}
