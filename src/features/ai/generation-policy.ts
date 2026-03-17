import { attemptsEnv } from '@/lib/config/env';
import {
  DEFAULT_ATTEMPT_CAP,
  getPlanGenerationWindowStart,
  PLAN_GENERATION_LIMIT,
  PLAN_GENERATION_WINDOW_MINUTES,
  PLAN_GENERATION_WINDOW_MS,
  resolveAttemptCap,
} from '@/shared/constants/generation';

/** Per-plan generation attempt cap (env-overridable, validated >= 1). */
export const ATTEMPT_CAP = resolveAttemptCap(attemptsEnv.cap);

export {
  DEFAULT_ATTEMPT_CAP,
  getPlanGenerationWindowStart,
  PLAN_GENERATION_LIMIT,
  PLAN_GENERATION_WINDOW_MINUTES,
  PLAN_GENERATION_WINDOW_MS,
};
