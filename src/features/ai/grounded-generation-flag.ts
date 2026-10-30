import type { SubscriptionTier } from '@/shared/types/billing.types';

import { groundedGeneration } from '@/flags';

/**
 * Whether `tier` runs grounded generation (the `grounded-generation` flag).
 * Fail closed: an evaluation error means the current pipeline, so a Flagship
 * outage degrades to ungrounded runs instead of failing or retrying plan and
 * lesson generation. `src/flags.ts` logs the failure once per
 * `FLAG_FAILURE_TTL_MS` window and serves it without a provider call.
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
