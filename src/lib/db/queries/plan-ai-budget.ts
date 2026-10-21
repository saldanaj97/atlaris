import type {
  DbGenerationBudgetCut,
  NewGenerationBudgetCut,
} from '@/lib/db/queries/types/generation-budget-cuts.types';
import type { DbClient } from '@/lib/db/types';

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
