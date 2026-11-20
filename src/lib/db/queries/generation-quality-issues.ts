import type {
  DbGenerationQualityIssue,
  NewGenerationQualityIssue,
} from '@/lib/db/queries/types/generation-quality-issues.types';
import type { DbClient } from '@/lib/db/types';

import { generationQualityIssues } from '@supabase/schema';
import { asc, eq, inArray } from 'drizzle-orm';

export async function insertGenerationQualityIssues(
  issues: NewGenerationQualityIssue[],
  dbClient: Pick<DbClient, 'insert'>,
): Promise<DbGenerationQualityIssue[]> {
  if (issues.length === 0) {
    return [];
  }

  return dbClient.insert(generationQualityIssues).values(issues).returning();
}

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
