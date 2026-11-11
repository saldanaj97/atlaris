import type {
  SubscriptionTier,
  TierLimitConfig,
  TierLimits,
} from '@/shared/types/billing.types';

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

/**
 * Limits for a card-required free trial (Starter, 3 days): one plan up to two
 * weeks, no regenerations. The AI side of the trial (per-plan ceiling, monthly
 * cap, daily pool) is in `TRIAL_AI_BUDGET`.
 */
export const TRIAL_LIMITS: TierLimitConfig = {
  maxActivePlans: 1,
  monthlyRegenerations: 0,
  maxWeeks: 2,
};

/** The billing fields that decide whether a user is on a free trial. */
export type TrialSubject = {
  readonly subscriptionTier: SubscriptionTier;
  readonly subscriptionStatus?: string | null;
};

/**
 * True while a paid plan is in its free trial. Clerk marks the item
 * `is_free_trial`, and the projection stores that as `trialing`.
 */
export function isTrialing(subject: TrialSubject): boolean {
  return (
    subject.subscriptionTier !== 'free' &&
    subject.subscriptionStatus === 'trialing'
  );
}

/** The plan, regeneration and duration limits that apply to this user now. */
export function limitsForUser(subject: TrialSubject): TierLimitConfig {
  return isTrialing(subject)
    ? TRIAL_LIMITS
    : TIER_LIMITS[subject.subscriptionTier];
}
