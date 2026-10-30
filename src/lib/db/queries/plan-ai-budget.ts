import type {
  DbGenerationBudgetCut,
  NewGenerationBudgetCut,
} from '@/lib/db/queries/types/generation-budget-cuts.types';
import type { DbClient } from '@/lib/db/types';

import {
  canonicalUsageToRecordParams,
  recordUsageInTx,
} from '../../../../supabase/usage';
import { billedUsageOf } from '@/features/ai/usage';
import { logger } from '@/lib/logging/logger';
import {
  aiUsageEvents,
  generationAttempts,
  generationBudgetCuts,
  planResearch,
} from '@supabase/schema';
import { and, count, eq, gte, max, sql } from 'drizzle-orm';

/**
 * AI spend in micro-USD for a plan's current generation: usage events and
 * research runs since its latest successful attempt started (everything when
 * it has none). An event without a provider cost counts its catalog
 * estimate. Events from before `ai_usage_events.plan_id` existed are not
 * counted.
 */
export async function sumPlanAiSpendMicrousd(
  planId: string,
  dbClient: Pick<DbClient, 'select'>,
): Promise<number> {
  const [latest] = await dbClient
    .select({ at: max(generationAttempts.createdAt) })
    .from(generationAttempts)
    .where(
      and(
        eq(generationAttempts.planId, planId),
        eq(generationAttempts.status, 'success'),
      ),
    );
  const since = latest?.at ?? null;
  const [usage, research] = await Promise.all([
    dbClient
      .select({
        spent: sql<
          string | null
        >`sum(COALESCE(${aiUsageEvents.providerCostMicrousd}, ${aiUsageEvents.costCents}::bigint * 10000))`,
      })
      .from(aiUsageEvents)
      .where(
        and(
          eq(aiUsageEvents.planId, planId),
          since ? gte(aiUsageEvents.createdAt, since) : undefined,
        ),
      ),
    dbClient
      .select({ spent: sql<string | null>`sum(${planResearch.costMicrousd})` })
      .from(planResearch)
      .where(
        and(
          eq(planResearch.planId, planId),
          since ? gte(planResearch.createdAt, since) : undefined,
        ),
      ),
  ]);
  return Number(usage[0]?.spent ?? 0) + Number(research[0]?.spent ?? 0);
}

/**
 * Records the usage an AI call's error carries (`billedUsageOf`) against the
 * plan, as its own usage event: OpenRouter billed the call even though its
 * output was discarded. Call it in the workflow step that made the call,
 * before the step throws, since a failed step attempt keeps no result. Does
 * nothing for an error without usage, and never throws, so the call's own
 * error is the one that propagates. Writes are server-owned (the Worker's
 * invocation client).
 */
export async function recordDiscardedCallUsage(
  error: unknown,
  owner: { readonly userId: string; readonly planId: string },
  dbClient: Pick<DbClient, 'insert'>,
): Promise<void> {
  const usage = billedUsageOf(error);
  if (!usage) {
    return;
  }
  try {
    const params = await canonicalUsageToRecordParams(usage, owner.userId);
    await recordUsageInTx(dbClient, { ...params, planId: owner.planId });
  } catch (recordError) {
    logger.error(
      {
        err: recordError,
        planId: owner.planId,
        event: 'discarded_call_usage_not_recorded',
      },
      'Failed to record the usage of a discarded AI call',
    );
  }
}

/**
 * Records steps a plan's AI spend ceiling cut. Writes are server-owned, so
 * `dbClient` must be the service-role client (or a transaction on it).
 */
export async function insertGenerationBudgetCuts(
  cuts: NewGenerationBudgetCut[],
  dbClient: Pick<DbClient, 'insert'>,
): Promise<DbGenerationBudgetCut[]> {
  if (cuts.length === 0) {
    return [];
  }

  return dbClient.insert(generationBudgetCuts).values(cuts).returning();
}

/**
 * Steps cut for one module's lessons, from `since` when given. RLS limits an
 * authenticated client to owned plans.
 */
export async function countGenerationBudgetCutsForModule(
  planId: string,
  moduleId: string,
  dbClient: Pick<DbClient, 'select'>,
  since?: Date,
): Promise<number> {
  const [row] = await dbClient
    .select({ value: count() })
    .from(generationBudgetCuts)
    .where(
      and(
        eq(generationBudgetCuts.planId, planId),
        eq(generationBudgetCuts.moduleId, moduleId),
        since ? gte(generationBudgetCuts.createdAt, since) : undefined,
      ),
    );
  return row?.value ?? 0;
}
