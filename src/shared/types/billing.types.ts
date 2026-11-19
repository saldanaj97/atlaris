export type SubscriptionTier = 'free' | 'starter' | 'pro';

export type TierLimitConfig = {
  maxActivePlans: number;
  monthlyRegenerations: number;
  maxWeeks: number | null;
};

export type TierLimits = Record<SubscriptionTier, TierLimitConfig>;
