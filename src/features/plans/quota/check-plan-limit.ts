/**
 * Plan quota checks (active plan count) — shared by persistence store and billing tests.
 */

import type { DbClient } from '@/lib/db/types';

import { resolveUserTier } from '@/features/billing/tier';
import { countPlansContributingToCap } from '@/lib/db/queries/helpers/plan-generation-status';
import { TIER_LIMITS } from '@/shared/constants/tier-limits';

export { countPlansContributingToCap };

export async function checkPlanLimit(
  userId: string,
  dbClient: DbClient,
): Promise<boolean> {
  const tier = await resolveUserTier(userId, dbClient);
  const tierConfig = TIER_LIMITS[tier];
  if (!tierConfig) {
    throw new Error(`Unknown subscription tier: ${tier}`);
  }
  const limit = tierConfig.maxActivePlans;

  if (limit === Infinity) {
    return true;
  }

  const currentCount = await countPlansContributingToCap(dbClient, userId);
  return currentCount < limit;
}
