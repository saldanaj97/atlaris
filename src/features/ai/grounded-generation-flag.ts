import type { SubscriptionTier } from '@/shared/types/billing.types';

import { groundedGeneration } from '@/flags';

const SUBSCRIPTION_TIERS: readonly unknown[] = [
  'free',
  'starter',
  'pro',
] satisfies SubscriptionTier[];

/**
 * Whether `tier` runs grounded generation (the `grounded-generation` flag).
 * Fail closed: an unlisted tier, a malformed value, or an evaluation error
 * means the current pipeline.
 */
export async function isGroundedEnabled(
  tier: SubscriptionTier,
): Promise<boolean> {
  try {
    const tiers: unknown = await groundedGeneration();
    return (
      Array.isArray(tiers) &&
      tiers.every((value) => SUBSCRIPTION_TIERS.includes(value)) &&
      tiers.includes(tier)
    );
  } catch {
    return false;
  }
}
