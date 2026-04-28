/**
 * Plan quota checks (active plan count) — shared by persistence store and billing tests.
 */

import { eq, sql } from 'drizzle-orm';

import { resolveUserTier } from '@/features/billing/tier';
import { TIER_LIMITS } from '@/features/billing/tier-limits';
import { learningPlans } from '@/lib/db/schema';
import type { DbClient } from '@/lib/db/types';

/**
 * Count plans that consume the user's plan quota (eligible + in-flight generating).
 * Accepts a DB handle or transaction for atomic check-and-insert.
 */
export async function countPlansContributingToCap(
  dbOrTx: Pick<DbClient, 'select'>,
  userId: string,
): Promise<number> {
  const [result] = await dbOrTx
    .select({
      count: sql`
        (
          count(*) FILTER (WHERE ${learningPlans.isQuotaEligible} = true)
          +
          count(*) FILTER (
            WHERE ${learningPlans.generationStatus} = 'generating'
              AND ${learningPlans.isQuotaEligible} = false
          )
        )::int
      `,
    })
    .from(learningPlans)
    .where(eq(learningPlans.userId, userId));

  const raw = result?.count;
  if (raw == null) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

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
