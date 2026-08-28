import type { SubscriptionTier } from '@/shared/types/billing.types';

export const ATTEMPT_ADMITTED_TIER_KEY = 'admitted_tier' as const;

const SUBSCRIPTION_TIERS: ReadonlySet<string> = new Set([
  'free',
  'starter',
  'pro',
]);

export function attemptMetadataWithAdmittedTier(tier: SubscriptionTier): {
  admitted_tier: SubscriptionTier;
} {
  return { [ATTEMPT_ADMITTED_TIER_KEY]: tier };
}

export function readAdmittedTierFromAttemptMetadata(
  metadata: unknown,
): SubscriptionTier | null {
  if (metadata == null || typeof metadata !== 'object') {
    return null;
  }
  const value = (metadata as Record<string, unknown>)[
    ATTEMPT_ADMITTED_TIER_KEY
  ];
  if (typeof value !== 'string' || !SUBSCRIPTION_TIERS.has(value)) {
    return null;
  }
  return value as SubscriptionTier;
}
