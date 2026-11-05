import type {
  UserGenerationAttemptsSinceParams,
  UserGenerationAttemptWindowStats,
} from '@/lib/db/queries/types/attempts.types';
import type { DbClient } from '@/lib/db/types';

import { PLAN_GENERATION_WINDOW_MS } from '@/shared/constants/generation';
import {
  deletedPlanGenerationAttempts,
  generationAttempts,
  learningPlans,
} from '@supabase/schema';
import { and, count, eq, gte, lt, min, type SQL } from 'drizzle-orm';

function userAttemptsSincePredicate(
  userId: string,
  since: Date,
): SQL | undefined {
  return and(
    eq(learningPlans.userId, userId),
    gte(generationAttempts.createdAt, since),
  );
}

export async function selectUserGenerationAttemptWindowStats({
  userId,
  dbClient,
  since,
}: UserGenerationAttemptsSinceParams): Promise<UserGenerationAttemptWindowStats> {
  // One statement, so a plan deleted mid-read is counted exactly once.
  const countedAttempts = dbClient
    .select({ createdAt: generationAttempts.createdAt })
    .from(generationAttempts)
    .innerJoin(learningPlans, eq(generationAttempts.planId, learningPlans.id))
    .where(userAttemptsSincePredicate(userId, since))
    .unionAll(
      dbClient
        .select({ createdAt: deletedPlanGenerationAttempts.attemptCreatedAt })
        .from(deletedPlanGenerationAttempts)
        .where(
          and(
            eq(deletedPlanGenerationAttempts.userId, userId),
            gte(deletedPlanGenerationAttempts.attemptCreatedAt, since),
          ),
        ),
    )
    .as('counted_attempts');

  const [row] = await dbClient
    .select({
      value: count(),
      oldestCreatedAt: min(countedAttempts.createdAt),
    })
    .from(countedAttempts);

  return {
    count: row?.value ?? 0,
    oldestAttemptCreatedAt: row?.oldestCreatedAt ?? null,
  };
}

export function computeRetryAfterSeconds(
  oldestAttemptCreatedAt: Date | null,
  now: Date,
): number {
  if (!oldestAttemptCreatedAt) {
    return Math.floor(PLAN_GENERATION_WINDOW_MS / 1000);
  }

  return Math.max(
    0,
    Math.floor(
      (oldestAttemptCreatedAt.getTime() +
        PLAN_GENERATION_WINDOW_MS -
        now.getTime()) /
        1000,
    ),
  );
}

/**
 * Keeps a deleted plan's attempts counting toward the hourly limit, and prunes the
 * owner's rows that have left the window. Call in the transaction that deletes the plan.
 */
export async function keepDeletedPlanAttemptsInWindow({
  userId,
  attemptCreatedAts,
  windowStart,
  tx,
}: {
  userId: string;
  attemptCreatedAts: Date[];
  windowStart: Date;
  tx: Pick<DbClient, 'insert' | 'delete'>;
}): Promise<void> {
  await tx
    .delete(deletedPlanGenerationAttempts)
    .where(
      and(
        eq(deletedPlanGenerationAttempts.userId, userId),
        lt(deletedPlanGenerationAttempts.attemptCreatedAt, windowStart),
      ),
    );

  if (attemptCreatedAts.length > 0) {
    await tx.insert(deletedPlanGenerationAttempts).values(
      attemptCreatedAts.map((attemptCreatedAt) => ({
        userId,
        attemptCreatedAt,
      })),
    );
  }
}
