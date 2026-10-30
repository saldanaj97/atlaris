import type { SubscriptionTier } from '@/shared/types/billing.types';

import { groundedGeneration } from '@/flags';
import { logger } from '@/lib/logging/logger';

/**
 * Whether `tier` runs grounded generation (the `grounded-generation` flag).
 * Fail closed: an evaluation error means the current pipeline. The error is
 * logged, not thrown, so a Flagship outage degrades to ungrounded runs
 * instead of failing or retrying plan and lesson generation.
 */
export async function isGroundedEnabled(
  tier: SubscriptionTier,
): Promise<boolean> {
  try {
    return await groundedGeneration(tier);
  } catch (error) {
    logger.warn(
      { tier, err: error },
      'grounded-generation flag evaluation failed; running ungrounded',
    );
    return false;
  }
}
