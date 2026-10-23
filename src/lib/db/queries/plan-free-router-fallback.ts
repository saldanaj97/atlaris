import type { DbClient } from '@/lib/db/types';

import { generationAttempts, modules } from '@supabase/schema';
import { and, count, desc, eq, sql } from 'drizzle-orm';

/** Which of a plan's current content ran on the free-router fallback. */
export type PlanFreeRouterFallback = {
  /** The latest successful outline attempt ran on the free router. */
  readonly outline: boolean;
  /** Ready modules whose lessons the free router served. */
  readonly lessonModuleCount: number;
};

/**
 * Reads the free-router flags (DEV-175): `metadata.provider.freeRouterFallback`
 * on the plan's latest successful attempt, and `freeRouterFallback` on each
 * ready module's lesson metadata. A later success on a paid model replaces
 * both, so the result describes only the content the plan shows now.
 */
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
