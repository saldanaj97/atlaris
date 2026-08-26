import type { TierLimits } from '@/shared/types/billing.types';

export const MAX_SELECTABLE_PLAN_WEEKS = 24;

export const TIER_LIMITS: TierLimits = {
  free: {
    maxActivePlans: 1,
    monthlyRegenerations: 0,
    maxWeeks: 2,
  },
  starter: {
    maxActivePlans: 10,
    monthlyRegenerations: 5,
    maxWeeks: 8,
  },
  pro: {
    maxActivePlans: Infinity,
    monthlyRegenerations: 25,
    maxWeeks: null,
  },
} as const;
