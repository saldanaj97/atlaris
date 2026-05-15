export type SubscriptionTier = 'free' | 'starter' | 'pro';

type TierLimitConfig = {
  maxActivePlans: number;
  monthlyRegenerations: number;
  monthlyExports: number;
  monthlyLessonGenerations: number;
  maxWeeks: number | null;
  maxHours: number | null;
};

export type TierLimits = Record<SubscriptionTier, TierLimitConfig>;
