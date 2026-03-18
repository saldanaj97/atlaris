// Barrel re-export — see individual modules for implementations
import { TIER_LIMITS } from './tier-limits';

export { resolveUserTier } from './tier';
export type { DbClient } from './tier';

export { TIER_LIMITS };
export type { SubscriptionTier } from './tier-limits.types';

export {
  incrementUsage,
  incrementPdfPlanUsage,
  getUsageSummary,
  decrementPdfPlanUsage,
  decrementRegenerationUsage,
} from './usage-metrics';

export {
  atomicCheckAndIncrementUsage,
  atomicCheckAndIncrementPdfUsage,
} from './quota';

export const __test__ = { TIER_LIMITS };
