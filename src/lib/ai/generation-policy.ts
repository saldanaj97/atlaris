import { DEFAULT_ATTEMPT_CAP } from '@/lib/ai/constants';
import { attemptsEnv } from '@/lib/config/env';

/**
 * Shared policy constants for generation control-plane behavior.
 *
 * Keep this module server-safe and deterministic so all generation entrypoints
 * (stream, retry, workers) can reuse the same durable window settings.
 */

/** Maximum durable generation attempts per user within a rolling window. */
export const PLAN_GENERATION_LIMIT = 10;

/** Rolling window size (in minutes) for durable per-user generation limiting. */
export const PLAN_GENERATION_WINDOW_MINUTES = 60;

/** Rolling window size in milliseconds. */
export const PLAN_GENERATION_WINDOW_MS =
  PLAN_GENERATION_WINDOW_MINUTES * 60 * 1000;

/** Per-plan generation attempt cap (env-overridable, validated >= 1). */
export const ATTEMPT_CAP = (() => {
  const raw = attemptsEnv.cap;
  if (!Number.isFinite(raw)) {
    return DEFAULT_ATTEMPT_CAP;
  }

  const floored = Math.floor(raw);
  if (floored < 1) {
    return DEFAULT_ATTEMPT_CAP;
  }

  return floored;
})();

/** Convenience helper for window-start derivation using a fixed "now". */
export function getPlanGenerationWindowStart(now: Date): Date {
  return new Date(now.getTime() - PLAN_GENERATION_WINDOW_MS);
}
