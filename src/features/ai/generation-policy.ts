import { getAttemptCap as getConfiguredAttemptCap } from '@/lib/config/env/ai';
import {
  DEFAULT_ATTEMPT_CAP,
  PLAN_GENERATION_LIMIT,
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

export { DEFAULT_ATTEMPT_CAP, PLAN_GENERATION_LIMIT };

export const getAttemptCap = generationAttemptCap;
