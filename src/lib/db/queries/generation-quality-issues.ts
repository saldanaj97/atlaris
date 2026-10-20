import type {
  DbGenerationQualityIssue,
  NewGenerationQualityIssue,
} from '@/lib/db/queries/types/generation-quality-issues.types';
import type { DbClient } from '@/lib/db/types';

import { generationQualityIssues } from '@supabase/schema';
import { asc, eq, inArray } from 'drizzle-orm';

/**
 * Records quality issues from a generation check or repair pass. Writes are
 * server-owned, so `dbClient` must be the service-role client (or a transaction on it).
 */
export async function insertGenerationQualityIssues(
  issues: NewGenerationQualityIssue[],
  dbClient: Pick<DbClient, 'insert'>,
): Promise<DbGenerationQualityIssue[]> {
  if (issues.length === 0) {
    return [];
  }

  return dbClient.insert(generationQualityIssues).values(issues).returning();
}

/** Lists a plan's quality issues, oldest first. RLS limits an authenticated client to owned plans. */
export async function listGenerationQualityIssuesForPlan(
  planId: string,
  dbClient: Pick<DbClient, 'select'>,
): Promise<DbGenerationQualityIssue[]> {
  return dbClient
    .select()
    .from(generationQualityIssues)
    .where(eq(generationQualityIssues.planId, planId))
    .orderBy(
      asc(generationQualityIssues.createdAt),
      asc(generationQualityIssues.id),
    );
}

/** Marks issues as resolved after a repair pass fixes them. Server-owned write. */
export async function markGenerationQualityIssuesResolved(
  issueIds: string[],
  dbClient: Pick<DbClient, 'update'>,
): Promise<number> {
  if (issueIds.length === 0) {
    return 0;
  }

  const updated = await dbClient
    .update(generationQualityIssues)
    .set({ resolved: true })
    .where(inArray(generationQualityIssues.id, issueIds))
    .returning({ id: generationQualityIssues.id });

  return updated.length;
}
