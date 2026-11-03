import { TIER_LIMITS } from '@/shared/constants/tier-limits';

const FREE_WEEKS = TIER_LIMITS.free.maxWeeks;
const FREE_PLANS = TIER_LIMITS.free.maxActivePlans;

/** The Free allowance in words, from the live tier limits: "one plan". */
export const FREE_PLAN_COUNT =
  FREE_PLANS === 1 ? 'one plan' : `${FREE_PLANS} plans`;

/** The longest Free plan in words: "two weeks". */
export const FREE_PLAN_LENGTH =
  FREE_WEEKS === 2 ? 'two weeks' : `${FREE_WEEKS} weeks`;
