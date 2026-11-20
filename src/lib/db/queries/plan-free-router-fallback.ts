import type { DbClient } from '@/lib/db/types';

import { generationAttempts, modules } from '@supabase/schema';
import { and, count, desc, eq, sql } from 'drizzle-orm';

export type PlanFreeRouterFallback = {
  readonly outline: boolean;
  readonly lessonModuleCount: number;
};

export async function getPlanFreeRouterFallback(
  planId: string,
  dbClient: Pick<DbClient, 'select'>,
): Promise<PlanFreeRouterFallback> {
  const [[latestSuccess], [lessons]] = await Promise.all([
    dbClient
      .select({
        freeRouterFallback: sql<
          string | null
        >`${generationAttempts.metadata}->'provider'->>'freeRouterFallback'`,
      })
      .from(generationAttempts)
      .where(
        and(
          eq(generationAttempts.planId, planId),
          eq(generationAttempts.status, 'success'),
        ),
      )
      .orderBy(desc(generationAttempts.createdAt))
      .limit(1),
    dbClient
      .select({ count: count() })
      .from(modules)
      .where(
        and(
          eq(modules.planId, planId),
          eq(modules.lessonGenerationStatus, 'ready'),
          sql`${modules.lessonGenerationMetadata}->>'freeRouterFallback' = 'true'`,
        ),
      ),
  ]);
  return {
    outline: latestSuccess?.freeRouterFallback === 'true',
    lessonModuleCount: lessons?.count ?? 0,
  };
}
