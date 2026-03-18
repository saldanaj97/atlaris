// Barrel re-export — see individual modules for implementations
import { TIER_LIMITS } from './tier-limits';

export { resolveUserTier } from './tier';
export type { DbClient } from './tier';

export type { SubscriptionTier } from './tier-limits.types';
export { TIER_LIMITS };

export {
  decrementPdfPlanUsage,
  decrementRegenerationUsage,
  getUsageSummary,
  incrementPdfPlanUsage,
  incrementUsage,
} from './usage-metrics';
export type { UsageSummary } from './usage-metrics';

export {
  atomicCheckAndIncrementPdfUsage,
  atomicCheckAndIncrementUsage,
} from './quota';

export const __test__ = { TIER_LIMITS };
