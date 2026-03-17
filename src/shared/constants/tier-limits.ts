import type { TierLimits } from '@/shared/types/billing.types';

export const TIER_LIMITS: TierLimits = {
  free: {
    maxActivePlans: 3,
    monthlyRegenerations: 5,
    monthlyExports: 10,
    monthlyPdfPlans: 3,
    maxPdfSizeMb: 5,
    maxPdfPages: 50,
    maxWeeks: 2,
    maxHours: null,
  },
  starter: {
    maxActivePlans: 10,
    monthlyRegenerations: 10,
    monthlyExports: 50,
    monthlyPdfPlans: 10,
    maxPdfSizeMb: 15,
    maxPdfPages: 100,
    maxWeeks: 8,
    maxHours: null,
  },
  pro: {
    maxActivePlans: Infinity,
    monthlyRegenerations: 50,
    monthlyExports: Infinity,
    monthlyPdfPlans: 50,
    maxPdfSizeMb: 50,
    maxPdfPages: 200,
    maxWeeks: null,
    maxHours: null,
  },
} as const;
