import type { SubscriptionTier } from '@/shared/types/billing.types';

import { groundedGeneration } from '@/flags';

export async function isGroundedEnabled(
  tier: SubscriptionTier,
): Promise<boolean> {
  try {
    return await groundedGeneration(tier);
  } catch {
    return false;
  }
}
