/**
 * Drizzle persistence for plan lifecycle mutations.
 */

import type { AtomicInsertResult } from '@/features/plans/lifecycle/types';
import type { DbClient, DbTransaction } from '@/lib/db/types';
import type { PlanGenerationCoreFields } from '@/shared/types/ai-provider.types';

import { getGenerationAttemptCap } from '@/features/ai/generation-policy';
import { selectUserSubscriptionTierForUpdate } from '@/features/billing/metered-reservation';
import { PlanCreationError } from '@/features/plans/errors';
import { countPlansContributingToCap } from '@/features/plans/quota/check-plan-limit';
import { PLAN_GENERATING_INSERT_DEFAULTS } from '@/lib/db/queries/helpers/plan-generation-status';
import { logger } from '@/lib/logging/logger';
import { TIER_LIMITS } from '@/shared/constants/tier-limits';
import { generationAttempts, learningPlans, modules } from '@supabase/schema';
import { and, count, eq, gte, inArray, notExists, sql } from 'drizzle-orm';

/** Window (in seconds) for detecting duplicate plan submissions. */
const DUPLICATE_DETECTION_WINDOW_SECONDS = 60;

type PlanWriteClient = Pick<DbClient, 'update'>;
type PlanUpdateTx = Pick<DbTransaction, 'update'>;

export async function markPlanGenerationSuccessInTx(
  tx: PlanUpdateTx,
  planId: string,
  timestamp: Date,
): Promise<void> {
  const updated = await tx
    .update(learningPlans)
    .set({
      generationStatus: 'ready',
      isQuotaEligible: true,
      finalizedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(eq(learningPlans.id, planId))
    .returning({ id: learningPlans.id });

  if (updated.length === 0) {
    logger.error(
      { planId, timestamp, updatedCount: updated.length },
      'markPlanGenerationSuccessInTx: no learningPlans rows updated in PlanUpdateTx',
    );
    throw new Error(
      `markPlanGenerationSuccessInTx: no plan updated for id ${planId}`,
    );
  }
}

export async function markPlanGenerationFailureInTx(
  tx: PlanUpdateTx,
  planId: string,
  timestamp: Date,
): Promise<void> {
  const updatedCount = await markPlanGenerationFailuresInTx(
    tx,
    [planId],
    timestamp,
  );

  if (updatedCount === 0) {
    logger.error(
      { planId, timestamp, updatedCount },
      'markPlanGenerationFailureInTx: no learningPlans rows updated in PlanUpdateTx',
    );
    throw new Error(
      `markPlanGenerationFailureInTx: no plan updated for id ${planId}`,
    );
  }
}

export async function markPlanGenerationFailuresInTx(
  tx: PlanUpdateTx,
  planIds: readonly string[],
  timestamp: Date,
): Promise<number> {
  if (planIds.length === 0) {
    return 0;
  }

  const updated = await tx
    .update(learningPlans)
    .set({
      generationStatus: 'failed',
      isQuotaEligible: false,
      updatedAt: timestamp,
    })
    .where(inArray(learningPlans.id, planIds))
    .returning({ id: learningPlans.id });

  return updated.length;
}

export async function atomicCheckAndInsertPlan(
  userId: string,
  planData: Readonly<PlanGenerationCoreFields> & {
    visibility: 'private';
    origin: 'ai' | 'manual' | 'template';
  },
  dbClient: DbClient,
): Promise<AtomicInsertResult> {
  return dbClient.transaction(async (tx) => {
    const user = await selectUserSubscriptionTierForUpdate(tx, userId);

    const windowStart = new Date(
      Date.now() - DUPLICATE_DETECTION_WINDOW_SECONDS * 1000,
    );
    const [duplicate] = await tx
      .select({ id: learningPlans.id })
      .from(learningPlans)
      .where(
        and(
          eq(learningPlans.userId, userId),
          sql`lower(${learningPlans.topic}) = lower(${planData.topic})`,
          gte(learningPlans.createdAt, windowStart),
          sql`${learningPlans.generationStatus} IN ('generating', 'ready')`,
        ),
      )
      .limit(1);

    if (duplicate) {
      return { status: 'duplicate', existingPlanId: duplicate.id };
    }

    const tier = user.subscriptionTier;
    const tierConfig = TIER_LIMITS[tier];
    if (!tierConfig) {
      throw new Error(`Unknown subscription tier: ${tier}`);
    }
    const limit = tierConfig.maxActivePlans;

    if (limit !== Infinity) {
      const currentCount = await countPlansContributingToCap(tx, userId);

      if (currentCount >= limit) {
        return { status: 'limit_reached', currentCount, limit };
      }
    }

    const [plan] = await tx
      .insert(learningPlans)
      .values({
        userId,
        ...planData,
        ...PLAN_GENERATING_INSERT_DEFAULTS,
      })
      .returning({ id: learningPlans.id });

    if (!plan) {
      throw new PlanCreationError();
    }

    return { status: 'created', id: plan.id };
  });
}

export async function markPlanGenerationSuccess(
  planId: string,
  dbClient: PlanWriteClient,
  now: () => Date = () => new Date(),
): Promise<void> {
  const timestamp = now();

  const updated = await dbClient
    .update(learningPlans)
    .set({
      generationStatus: 'ready',
      isQuotaEligible: true,
      finalizedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(eq(learningPlans.id, planId))
    .returning({ id: learningPlans.id });

  if (updated.length === 0) {
    logger.warn(
      { planId },
      'markPlanGenerationSuccess: no rows updated — plan may have been deleted',
    );
  }
}

export async function markPlanGenerationFailure(
  planId: string,
  dbClient: PlanWriteClient,
  now: () => Date = () => new Date(),
): Promise<void> {
  const timestamp = now();

  const updated = await dbClient
    .update(learningPlans)
    .set({
      generationStatus: 'failed',
      isQuotaEligible: false,
      updatedAt: timestamp,
    })
    .where(eq(learningPlans.id, planId))
    .returning({ id: learningPlans.id });

  if (updated.length === 0) {
    logger.warn(
      { planId },
      'markPlanGenerationFailure: no rows updated — plan may have been deleted',
    );
  }
}

export async function findCappedPlanWithoutModules(
  userDbId: string,
  db: DbClient,
): Promise<string | null> {
  const [row] = await db
    .select({ planId: generationAttempts.planId })
    .from(generationAttempts)
    .innerJoin(learningPlans, eq(generationAttempts.planId, learningPlans.id))
    .where(
      and(
        eq(learningPlans.userId, userDbId),
        notExists(
          db
            .select({ planId: modules.planId })
            .from(modules)
            .where(eq(modules.planId, generationAttempts.planId)),
        ),
      ),
    )
    .groupBy(generationAttempts.planId)
    .having(gte(count(generationAttempts.id), getGenerationAttemptCap()))
    .limit(1);

  return row?.planId ?? null;
}
