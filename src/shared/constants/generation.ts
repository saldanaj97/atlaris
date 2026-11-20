/**
 * Pure generation-policy constants shared across infrastructure and feature layers.
 *
 * These are deterministic values with no runtime dependencies.
 * The env-overridable ATTEMPT_CAP is computed via {@link resolveAttemptCap}
 * in lib/config/env/ai.ts (for lib consumers) and
 * features/ai/generation-policy.ts (for feature consumers and tests).
 */

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

export const PLAN_GENERATION_LIMIT = 10;

export const PLAN_GENERATION_WINDOW_MINUTES = 60;

export const PLAN_GENERATION_WINDOW_MS =
  PLAN_GENERATION_WINDOW_MINUTES * 60 * 1000;

export function getPlanGenerationWindowStart(now: Date): Date {
  return new Date(now.getTime() - PLAN_GENERATION_WINDOW_MS);
}
