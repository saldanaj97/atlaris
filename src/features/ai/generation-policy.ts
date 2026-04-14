import { getAttemptCap as getConfiguredAttemptCap } from '@/lib/config/env/ai';
import {
  DEFAULT_ATTEMPT_CAP,
  getPlanGenerationWindowStart,
  PLAN_GENERATION_LIMIT,
  PLAN_GENERATION_WINDOW_MINUTES,
  PLAN_GENERATION_WINDOW_MS,
} from '@/shared/constants/generation';

/**
 * Reads the normalized per-plan attempt cap from an injected dependency.
 */
export type AttemptCapReader = () => number;

export function createGetAttemptCap(
  readAttemptCap: AttemptCapReader = getConfiguredAttemptCap
): AttemptCapReader {
  return (): number => readAttemptCap();
}

const generationAttemptCap = createGetAttemptCap();

export {
  DEFAULT_ATTEMPT_CAP,
  getPlanGenerationWindowStart,
  PLAN_GENERATION_LIMIT,
  PLAN_GENERATION_WINDOW_MINUTES,
  PLAN_GENERATION_WINDOW_MS,
};

export const getAttemptCap = generationAttemptCap;
