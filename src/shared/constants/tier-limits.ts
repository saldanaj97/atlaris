import type { TierLimits } from '@/shared/types/billing.types';

export const MAX_SELECTABLE_PLAN_WEEKS = 24;

export const TIER_LIMITS: TierLimits = {
  free: {
    maxActivePlans: 1,
    // 0 still 429s via existing metered reservation until Batch 2 maps
    // Free regeneration to PLAN_REGENERATION_NOT_INCLUDED (403).
    monthlyRegenerations: 0,
    monthlyLessonGenerations: 3,
    maxWeeks: 2,
  },
  starter: {
    maxActivePlans: 10,
    monthlyRegenerations: 5,
    monthlyLessonGenerations: 25,
    maxWeeks: 8,
  },
  pro: {
    maxActivePlans: Infinity,
    monthlyRegenerations: 25,
    monthlyLessonGenerations: Infinity,
    maxWeeks: null,
  },
} as const;
