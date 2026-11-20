import { getAttemptCap as getConfiguredAttemptCap } from '@/lib/config/env/ai';
import {
  DEFAULT_ATTEMPT_CAP,
  PLAN_GENERATION_LIMIT,
} from '@/shared/constants/generation';

export { DEFAULT_ATTEMPT_CAP, PLAN_GENERATION_LIMIT };

export const getGenerationAttemptCap = (): number => getConfiguredAttemptCap();
