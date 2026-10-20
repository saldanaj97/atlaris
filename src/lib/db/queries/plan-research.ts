import type {
  NewPlanResearch,
  NewResearchSource,
  PlanResearchWithSources,
} from '@/lib/db/queries/types/plan-research.types';
import type { DbClient } from '@/lib/db/types';

import { planResearch, researchSources } from '@supabase/schema';
import { asc, desc, eq, sql } from 'drizzle-orm';

/** Orders `S1`, `S2`, …, `S10` numerically rather than as text. */
const citationNumber = sql`substring(${researchSources.citationKey} from 2)::integer`;

/**
 * Stores one research run and its sources atomically. Writes are server-owned,
 * so `dbClient` must be the service-role client (or a transaction on it).
 */
export async function insertPlanResearch(
  {
    research,
    sources,
  }: { research: NewPlanResearch; sources: NewResearchSource[] },
  dbClient: Pick<DbClient, 'transaction'>,
): Promise<PlanResearchWithSources> {
  return dbClient.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(planResearch)
      .values(research)
      .returning();

    const insertedSources =
      sources.length > 0
        ? await tx
            .insert(researchSources)
            .values(
              sources.map((source) => ({
                ...source,
                researchId: inserted.id,
              })),
            )
            .returning()
        : [];

    insertedSources.sort(
      (a, b) => Number(a.citationKey.slice(1)) - Number(b.citationKey.slice(1)),
    );

    return { research: inserted, sources: insertedSources };
  });
}

/**
 * Returns the plan's current research run (the most recent row) with its
 * sources, or `null` when the plan has none. RLS limits an authenticated
 * client to plans the caller owns.
 */
export async function getLatestPlanResearch(
  planId: string,
  dbClient: Pick<DbClient, 'select'>,
): Promise<PlanResearchWithSources | null> {
  const [research] = await dbClient
    .select()
    .from(planResearch)
    .where(eq(planResearch.planId, planId))
    .orderBy(desc(planResearch.createdAt), desc(planResearch.id))
    .limit(1);

  if (!research) {
    return null;
  }

  const sources = await dbClient
    .select()
    .from(researchSources)
    .where(eq(researchSources.researchId, research.id))
    .orderBy(asc(citationNumber));

  return { research, sources };
}
