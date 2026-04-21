/**
 * Adapter-private Drizzle persistence for plan lifecycle mutations.
 * Do not import outside lifecycle adapters / composition roots.
 */

import { and, count, eq, gte, notExists, sql } from 'drizzle-orm';

import { getAttemptCap } from '@/features/ai/generation-policy';
import { selectUserSubscriptionTierForUpdate } from '@/features/billing/metered-reservation';
import { TIER_LIMITS } from '@/features/billing/tier-limits';
import {
  PlanCreationError,
  PlanLimitReachedError,
} from '@/features/plans/errors';
import { countPlansContributingToCap } from '@/features/plans/quota/check-plan-limit';
import { PLAN_GENERATING_INSERT_DEFAULTS } from '@/lib/db/queries/helpers/plan-generation-status';
import { generationAttempts, learningPlans, modules } from '@/lib/db/schema';
import type { DbClient } from '@/lib/db/types';
import { logger } from '@/lib/logging/logger';

/** Window (in seconds) for detecting duplicate plan submissions. */
const DUPLICATE_DETECTION_WINDOW_SECONDS = 60;

type PlanWriteClient = Pick<DbClient, 'update'>;

export async function atomicCheckAndInsertPlan(
  userId: string,
  planData: {
    topic: string;
    skillLevel: 'beginner' | 'intermediate' | 'advanced';
    weeklyHours: number;
    learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
    visibility: 'private';
    origin: 'ai' | 'manual' | 'template';
    startDate?: string | null;
    deadlineDate?: string | null;
  },
  dbClient: DbClient
): Promise<{ id: string }> {
  return dbClient.transaction(async (tx) => {
    const user = await selectUserSubscriptionTierForUpdate(tx, userId);

    const tier = user.subscriptionTier;
    const tierConfig = TIER_LIMITS[tier];
    if (!tierConfig) {
      throw new Error(`Unknown subscription tier: ${tier}`);
    }
    const limit = tierConfig.maxActivePlans;

    if (limit !== Infinity) {
      const currentCount = await countPlansContributingToCap(tx, userId);

      if (currentCount >= limit) {
        throw new PlanLimitReachedError(currentCount, limit);
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

    return plan;
  });
}

export async function markPlanGenerationSuccess(
  planId: string,
  dbClient: PlanWriteClient,
  now: () => Date = () => new Date()
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
      'markPlanGenerationSuccess: no rows updated — plan may have been deleted'
    );
  }
}

export async function markPlanGenerationFailure(
  planId: string,
  dbClient: PlanWriteClient,
  now: () => Date = () => new Date()
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
      'markPlanGenerationFailure: no rows updated — plan may have been deleted'
    );
  }
}

export async function findRecentDuplicatePlan(
  userId: string,
  normalizedTopic: string,
  dbClient: DbClient
): Promise<string | null> {
  const windowStart = new Date(
    Date.now() - DUPLICATE_DETECTION_WINDOW_SECONDS * 1000
  );

  const [row] = await dbClient
    .select({ id: learningPlans.id })
    .from(learningPlans)
    .where(
      and(
        eq(learningPlans.userId, userId),
        sql`lower(${learningPlans.topic}) = lower(${normalizedTopic})`,
        gte(learningPlans.createdAt, windowStart),
        sql`${learningPlans.generationStatus} IN ('generating', 'ready')`
      )
    )
    .limit(1);

  return row?.id ?? null;
}

export async function findCappedPlanWithoutModules(
  userDbId: string,
  db: DbClient
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
            .where(eq(modules.planId, generationAttempts.planId))
        )
      )
    )
    .groupBy(generationAttempts.planId)
    .having(gte(count(generationAttempts.id), getAttemptCap()))
    .limit(1);

  return row?.planId ?? null;
}
