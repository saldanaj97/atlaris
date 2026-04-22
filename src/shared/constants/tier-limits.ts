import type { TierLimits } from '@/shared/types/billing.types';

export const TIER_LIMITS: TierLimits = {
	free: {
		maxActivePlans: 3,
		monthlyRegenerations: 5,
		monthlyExports: 10,
		maxWeeks: 2,
		maxHours: null,
	},
	starter: {
		maxActivePlans: 10,
		monthlyRegenerations: 10,
		monthlyExports: 50,
		maxWeeks: 8,
		maxHours: null,
	},
	pro: {
		maxActivePlans: Infinity,
		monthlyRegenerations: 50,
		monthlyExports: Infinity,
		maxWeeks: null,
		maxHours: null,
	},
} as const;
