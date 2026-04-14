export type SubscriptionTier = 'free' | 'starter' | 'pro';
export type PaidSubscriptionTier = Exclude<SubscriptionTier, 'free'>;

export const PAID_SUBSCRIPTION_TIERS = [
  'starter',
  'pro',
] as const satisfies readonly PaidSubscriptionTier[];

export type TierLimitConfig = {
  maxActivePlans: number;
  monthlyRegenerations: number;
  monthlyExports: number;
  monthlyPdfPlans: number;
  maxPdfSizeMb: number;
  maxPdfPages: number;
  maxWeeks: number | null;
  maxHours: number | null;
};

export type TierLimits = Record<SubscriptionTier, TierLimitConfig>;
