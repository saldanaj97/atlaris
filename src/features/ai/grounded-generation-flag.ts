import type { SubscriptionTier } from '@/shared/types/billing.types';

import { groundedGeneration } from '@/flags';

/**
 * Whether `tier` runs grounded generation (the `grounded-generation` flag).
 * Fail closed: an evaluation error means the current pipeline.
 */
export async function isGroundedEnabled(
  tier: SubscriptionTier,
): Promise<boolean> {
  try {
    return await groundedGeneration(tier);
  } catch {
    return false;
  }
}
