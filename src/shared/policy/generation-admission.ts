import type { SubscriptionTier } from '@/shared/types/billing.types';

export const SUBSCRIPTION_REQUIRED_MESSAGE =
  'An active subscription is required to generate plans. Choose a plan to continue.';

export type GenerationAdmissionDecision = 'ok' | 'subscription_required';

/**
 * The hosted app is paid-only. The `free` tier is the "no subscription" state
 * (never subscribed, or lapsed), and it cannot start any AI generation.
 */
export function evaluateGenerationAdmission(params: {
  tier: SubscriptionTier;
}): GenerationAdmissionDecision {
  return params.tier === 'free' ? 'subscription_required' : 'ok';
}
