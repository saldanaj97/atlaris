import { getAttemptCap as getConfiguredAttemptCap } from '@/lib/config/env/ai';
import {
  DEFAULT_ATTEMPT_CAP,
  PLAN_GENERATION_LIMIT,
} from '@/shared/constants/generation';

export { DEFAULT_ATTEMPT_CAP, PLAN_GENERATION_LIMIT };

/** Normalized per-plan attempt cap, read from config on each call. */
export const getGenerationAttemptCap = (): number => getConfiguredAttemptCap();
